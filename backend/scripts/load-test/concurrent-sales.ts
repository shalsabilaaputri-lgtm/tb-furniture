const apiUrl = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const required = ['LOGIN_EMAIL', 'LOGIN_PASSWORD', 'BRANCH_ID', 'WAREHOUSE_ID', 'PRODUCT_UNIT_ID'] as const;
for (const key of required) if (!process.env[key]) throw new Error(`${key} wajib diisi.`);

async function main() {
  const login = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.LOGIN_EMAIL, password: process.env.LOGIN_PASSWORD }),
  });
  if (!login.ok) throw new Error(`Login gagal: ${login.status} ${await login.text()}`);
  const { accessToken } = await login.json() as { accessToken: string };
  const requests = Number(process.env.CONCURRENT_REQUESTS ?? 100);

  const responses = await Promise.all(Array.from({ length: requests }, () => fetch(`${apiUrl}/sales`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      branchId: process.env.BRANCH_ID,
      warehouseId: process.env.WAREHOUSE_ID,
      items: [{ productUnitId: process.env.PRODUCT_UNIT_ID, quantity: 1 }],
      paymentMethod: 'CASH',
    }),
  })));
  const statusCounts = responses.reduce<Record<number, number>>((result, response) => {
    result[response.status] = (result[response.status] ?? 0) + 1;
    return result;
  }, {});
  const stockResponse = await fetch(`${apiUrl}/stock?branchId=${process.env.BRANCH_ID}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const stocks = await stockResponse.json() as Array<{ quantity: string; reservedQuantity: string; damagedQuantity: string }>;
  const invalid = stocks.filter((stock) => Number(stock.quantity) < Number(stock.reservedQuantity) + Number(stock.damagedQuantity));
  if (invalid.length) throw new Error(`Ditemukan ${invalid.length} baris stok tidak valid.`);
  console.info(JSON.stringify({ requests, statusCounts, invalidStockRows: invalid.length }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
