import { getDb } from "@/db";
import { apiError, requireApiUser } from "@/lib/api-auth";
import { can } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const accessUser = await requireApiUser("dashboard.read");
    const d1 = getDb();
    const [branchResult, stockResult, movementResult, customerResult, performanceResult, transactionResult, transactionItemResult, returnResult, financeResult, receivablePaymentResult, expenseResult, employeeResult, attendanceHistoryResult] = await d1.batch([
      d1.prepare("SELECT id,name,short_name AS shortName,address FROM branches WHERE is_active=1 ORDER BY id"),
      d1.prepare(`SELECT p.id,p.sku,p.barcode,p.name,p.brand,p.category,p.series,p.color,p.size,p.unit,
        p.pieces_per_box AS piecesPerBox,p.sqm_per_box AS sqmPerBox,p.landed_cost AS landedCost,
        p.selling_price AS sellingPrice,p.wholesale_price AS wholesalePrice,p.project_price AS projectPrice,
        p.minimum_price AS minimumPrice,p.minimum_stock AS minimumStock,
        s.branch_id AS branchId,b.short_name AS branchName,
        SUM(s.physical_qty) AS physicalQty,SUM(s.reserved_qty) AS reservedQty,SUM(s.damaged_qty) AS damagedQty
        FROM products p
        LEFT JOIN stocks s ON s.product_id=p.id
        LEFT JOIN branches b ON b.id=s.branch_id
        WHERE p.is_active=1
        GROUP BY p.id,s.branch_id,b.id,b.short_name
        ORDER BY p.brand,p.name,b.id`),
      d1.prepare(`SELECT m.id,m.reference_number AS referenceNumber,m.movement_type AS movementType,
        m.quantity,m.stock_before AS stockBefore,m.stock_after AS stockAfter,m.reason,m.created_at AS createdAt,
        p.name AS productName,m.branch_id AS branchId,b.short_name AS branchName
        FROM stock_movements m JOIN products p ON p.id=m.product_id JOIN branches b ON b.id=m.branch_id
        ORDER BY m.created_at DESC,m.rowid DESC LIMIT 12`),
      d1.prepare("SELECT id,name,whatsapp,type,credit_limit AS creditLimit,outstanding,referral_code AS referralCode FROM customers ORDER BY name"),
      d1.prepare(`SELECT b.id,b.short_name AS branchName,COALESCE(SUM(s.total),0) AS omzet,COUNT(s.id) AS transactions,
        COALESCE(SUM(COALESCE(cost.totalCost,CAST(s.total*0.82 AS INTEGER))),0) AS hpp
        FROM branches b
        LEFT JOIN sales s ON s.branch_id=b.id
          AND s.created_at >= CURRENT_DATE
          AND s.created_at < CURRENT_DATE + INTERVAL '1 day'
          AND s.status!='VOID'
        LEFT JOIN (SELECT sale_id,SUM(cost_price*quantity) AS totalCost FROM sale_items GROUP BY sale_id) cost ON cost.sale_id=s.id
        GROUP BY b.id ORDER BY b.id`),
      d1.prepare(`SELECT s.id,s.invoice_number AS invoiceNumber,s.branch_id AS branchId,b.short_name AS branchName,
        s.customer_id AS customerId,COALESCE(c.name,NULLIF(s.customer_name,''),'Customer Umum') AS customerName,
        COALESCE(NULLIF(s.customer_phone,''),c.whatsapp,'') AS customerPhone,
        s.subtotal,s.discount,s.delivery_distance AS deliveryDistance,s.delivery_fee AS deliveryFee,
        s.delivery_approval AS deliveryApproval,s.total,s.payment_method AS paymentMethod,s.paid_amount AS paidAmount,
        s.credit_due_rule AS creditDueRule,s.credit_due_date AS creditDueDate,
        s.status,s.user_email AS userEmail,s.created_at AS createdAt
        FROM sales s JOIN branches b ON b.id=s.branch_id LEFT JOIN customers c ON c.id=s.customer_id
        ORDER BY s.created_at DESC,s.rowid DESC LIMIT 50`),
      d1.prepare(`SELECT si.sale_id AS saleId,si.product_id AS productId,p.name AS productName,
        si.quantity,si.unit,si.unit_price AS unitPrice,si.cost_price AS costPrice,si.line_total AS lineTotal
        FROM sale_items si JOIN products p ON p.id=si.product_id
        WHERE si.sale_id IN (SELECT id FROM sales ORDER BY created_at DESC,rowid DESC LIMIT 50)
        ORDER BY si.rowid`),
      d1.prepare(`SELECT cr.id,cr.return_number AS returnNumber,cr.sale_id AS saleId,s.invoice_number AS invoiceNumber,
        cr.branch_id AS branchId,b.short_name AS branchName,COALESCE(c.name,'Customer Umum') AS customerName,
        cr.total_refund AS totalRefund,cr.reason,cr.condition,cr.status,cr.created_at AS createdAt
        FROM customer_returns cr JOIN sales s ON s.id=cr.sale_id JOIN branches b ON b.id=cr.branch_id
        LEFT JOIN customers c ON c.id=cr.customer_id ORDER BY cr.created_at DESC,cr.rowid DESC LIMIT 30`),
      d1.prepare(`SELECT
        COALESCE((SELECT SUM(amount) FROM expenses
          WHERE created_at >= CURRENT_DATE
            AND created_at < CURRENT_DATE + INTERVAL '1 day'),0) AS expenseToday,
        COALESCE((SELECT SUM(amount) FROM expenses
          WHERE created_at >= date_trunc('month', CURRENT_DATE)
            AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'),0) AS expenseMonth,
        COALESCE((SELECT SUM(total) FROM sales
          WHERE created_at >= date_trunc('month', CURRENT_DATE)
            AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
            AND status!='VOID'),0) AS omzetMonth,
        COALESCE((SELECT SUM(COALESCE(cost.totalCost,CAST(s.total*0.82 AS INTEGER))) FROM sales s
          LEFT JOIN (SELECT sale_id,SUM(cost_price*quantity) AS totalCost FROM sale_items GROUP BY sale_id) cost ON cost.sale_id=s.id
          WHERE s.created_at >= date_trunc('month', CURRENT_DATE)
            AND s.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
            AND s.status!='VOID'),0) AS hppMonth`),
      d1.prepare(`SELECT rp.id,rp.reference_number AS referenceNumber,rp.customer_id AS customerId,c.name AS customerName,
        rp.branch_id AS branchId,b.short_name AS branchName,rp.amount,rp.method,rp.created_at AS createdAt
        FROM receivable_payments rp JOIN customers c ON c.id=rp.customer_id JOIN branches b ON b.id=rp.branch_id
        ORDER BY rp.created_at DESC,rp.rowid DESC LIMIT 30`),
      d1.prepare(`SELECT e.id,e.branch_id AS branchId,b.short_name AS branchName,e.category,e.amount,
        e.payment_method AS paymentMethod,e.description,e.created_at AS createdAt
        FROM expenses e JOIN branches b ON b.id=e.branch_id ORDER BY e.created_at DESC,e.rowid DESC LIMIT 50`),
      d1.prepare(`SELECT e.id,e.branch_id AS branchId,b.short_name AS branchName,e.name,e.position,e.phone,
        e.scheduled_start AS scheduledStart,a.id AS attendanceId,a.check_in_time AS checkInTime,
        a.status,a.note,a.attendance_date AS attendanceDate
        FROM employees e JOIN branches b ON b.id=e.branch_id
        LEFT JOIN attendance a ON a.employee_id=e.id AND a.attendance_date=DATE('now','+7 hours')
        WHERE e.is_active=1 ORDER BY b.id,e.name`),
      d1.prepare(`SELECT a.id,a.employee_id AS employeeId,e.name AS employeeName,a.branch_id AS branchId,
        b.short_name AS branchName,a.attendance_date AS attendanceDate,a.scheduled_start AS scheduledStart,
        a.check_in_time AS checkInTime,a.status,a.note,a.created_at AS createdAt
        FROM attendance a JOIN employees e ON e.id=a.employee_id JOIN branches b ON b.id=a.branch_id
        ORDER BY a.attendance_date DESC,a.created_at DESC,a.rowid DESC LIMIT 100`),
    ]);

    const productMap = new Map<string, any>();
    for (const row of stockResult.results as any[]) {
      if (!productMap.has(row.id)) {
        productMap.set(row.id, { ...row, stocks: [], physicalQty: undefined, reservedQty: undefined, damagedQty: undefined, branchId: undefined, branchName: undefined });
      }
      if (row.branchId) {
        const physical = Number(row.physicalQty ?? 0);
        const reserved = Number(row.reservedQty ?? 0);
        const damaged = Number(row.damagedQty ?? 0);
        productMap.get(row.id).stocks.push({
          branchId: row.branchId,
          branchName: row.branchName,
          physical,
          reserved,
          damaged,
          available: Math.max(0, physical - reserved - damaged),
        });
      }
    }

    const totalOutstanding = (customerResult.results as any[]).reduce((sum, customer) => sum + Number(customer.outstanding ?? 0), 0);
    const products = Array.from(productMap.values());

    const transactionMap = new Map<string, any>();
    for (const transaction of transactionResult.results as any[]) transactionMap.set(transaction.id, { ...transaction, items: [] });
    for (const item of transactionItemResult.results as any[]) transactionMap.get(item.saleId)?.items.push(item);
    const financial = (financeResult.results[0] ?? {}) as any;
    const scopedBranchId = can(accessUser, "branch.read_all") ? null : accessUser.branchId;
    const canSeeAllStock = can(accessUser, "branch.read_all") || can(accessUser, "stock.read_all");
    const inScope = (row: any) => !scopedBranchId || row.branchId === scopedBranchId;
    const canSeeCost = can(accessUser, "cost_price.read");
    const canSeeFinance = can(accessUser, "finance.read");
    const canSeeReceivables = canSeeFinance || can(accessUser, "receivable.read");
    const canSeePerformance = can(accessUser, "report.read");
    const scopedProducts = products.map((product) => ({
      ...product,
      landedCost: canSeeCost ? product.landedCost : 0,
      stocks: canSeeAllStock || !scopedBranchId ? product.stocks : product.stocks.filter((stock: any) => stock.branchId === scopedBranchId),
    }));
    const scopedTransactions = Array.from(transactionMap.values()).filter(inScope).map((transaction: any) => ({
      ...transaction,
      items: transaction.items.map((item: any) => ({ ...item, costPrice: canSeeCost ? item.costPrice : undefined })),
    }));
    const scopedExpenses = (expenseResult.results as any[]).filter(inScope);
    const scopedPerformance = (performanceResult.results as any[]).filter(inScope);
    const dailyOmzet = scopedPerformance.reduce((sum, row) => sum + Number(row.omzet || 0), 0);
    const dailyHpp = scopedPerformance.reduce((sum, row) => sum + Number(row.hpp || 0), 0);
    const dailyTransactions = scopedPerformance.reduce((sum, row) => sum + Number(row.transactions || 0), 0);
    const month = new Date().toISOString().slice(0, 7);
    const scopedMonthSales = scopedTransactions.filter((row: any) => row.createdAt.slice(0, 7) === month && row.status !== "VOID");
    const scopedMonthOmzet = scopedMonthSales.reduce((sum: number, row: any) => sum + Number(row.total || 0), 0);
    const scopedMonthHpp = scopedMonthSales.reduce((sum: number, row: any) => sum + row.items.reduce((itemSum: number, item: any) => itemSum + Number(item.costPrice || item.unitPrice * .82) * Number(item.quantity), 0), 0);
    const scopedMonthExpense = scopedExpenses.filter((row: any) => row.createdAt.slice(0, 7) === month).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const effectiveFinancial = scopedBranchId ? {
      expenseToday: scopedExpenses.filter((row: any) => row.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).reduce((sum, row) => sum + Number(row.amount || 0), 0),
      expenseMonth: scopedMonthExpense, omzetMonth: scopedMonthOmzet, hppMonth: scopedMonthHpp,
    } : financial;

    return Response.json({
      demoMode: false,
      currentUser: accessUser,
      branches: (branchResult.results as any[]).filter((row) => canSeeAllStock || !scopedBranchId || row.id === scopedBranchId),
      products: scopedProducts,
      movements: (movementResult.results as any[]).filter(inScope),
      customers: (customerResult.results as any[]).map((row) => ({ ...row, creditLimit: canSeeReceivables ? row.creditLimit : 0, outstanding: canSeeReceivables ? row.outstanding : 0 })),
      performance: canSeePerformance ? scopedPerformance : [],
      transactions: scopedTransactions,
      returns: (returnResult.results as any[]).filter(inScope),
      receivablePayments: canSeeReceivables ? (receivablePaymentResult.results as any[]).filter(inScope) : [],
      expenses: canSeeFinance ? scopedExpenses : [],
      employees: (employeeResult.results as any[]).filter(inScope),
      attendanceHistory: (attendanceHistoryResult.results as any[]).filter(inScope),
      financial: {
        expenseToday: canSeeFinance ? Number(effectiveFinancial.expenseToday ?? 0) : 0,
        expenseMonth: canSeeFinance ? Number(effectiveFinancial.expenseMonth ?? 0) : 0,
        omzetMonth: canSeeFinance ? Number(effectiveFinancial.omzetMonth ?? 0) : 0,
        hppMonth: canSeeFinance && canSeeCost ? Number(effectiveFinancial.hppMonth ?? 0) : 0,
        grossProfitMonth: canSeeFinance && canSeeCost ? Number(effectiveFinancial.omzetMonth ?? 0) - Number(effectiveFinancial.hppMonth ?? 0) : 0,
        netProfitMonth: canSeeFinance && canSeeCost ? Number(effectiveFinancial.omzetMonth ?? 0) - Number(effectiveFinancial.hppMonth ?? 0) - Number(effectiveFinancial.expenseMonth ?? 0) : 0,
      },
      metrics: {
        omzet: dailyOmzet,
        hpp: canSeeCost ? dailyHpp : 0,
        grossProfit: canSeeCost ? dailyOmzet - dailyHpp : 0,
        transactions: dailyTransactions,
        averageTransaction: dailyTransactions ? dailyOmzet / dailyTransactions : 0,
        receivables: canSeeReceivables ? totalOutstanding : 0,
        inventoryValue: canSeeCost ? scopedProducts.reduce((sum, product) => sum + product.stocks.reduce((subtotal: number, item: any) => subtotal + item.physical, 0) * Number(product.landedCost), 0) : 0,
        lowStock: scopedProducts.filter((product) => product.stocks.reduce((sum: number, item: any) => sum + item.available, 0) <= Number(product.minimumStock)).length,
        outOfStock: scopedProducts.filter((product) => product.stocks.reduce((sum: number, item: any) => sum + item.available, 0) === 0).length,
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiError(error);
  }
}
