"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Loader2, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Branch = { id: string; name: string; shortName: string };
type Employee = {
  id: string; branchId: string; branchName: string; name: string; position: string; phone: string;
  scheduledStart: string; attendanceId?: string | null; checkInTime?: string | null;
  status?: "PRESENT" | "LATE" | "ABSENT" | null; note?: string; attendanceDate?: string | null;
};
type AttendanceHistory = {
  id: string; employeeId: string; employeeName: string; branchId: string; branchName: string;
  attendanceDate: string; scheduledStart: string; checkInTime?: string | null;
  status: "PRESENT" | "LATE" | "ABSENT"; note: string; createdAt: string;
};

async function json(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
  return data;
}

function statusBadge(status?: Employee["status"]) {
  if (status === "PRESENT") return <Badge className="bg-emerald-600">Hadir</Badge>;
  if (status === "LATE") return <Badge className="bg-amber-500 text-white">Terlambat</Badge>;
  if (status === "ABSENT") return <Badge variant="destructive">Tidak Masuk</Badge>;
  return <Badge variant="secondary">Belum Presensi</Badge>;
}

export function AttendancePanel({ data, branch, reload }: {
  data: { branches: Branch[]; employees: Employee[]; attendanceHistory: AttendanceHistory[] };
  branch: string;
  reload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [absentEmployee, setAbsentEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const employees = useMemo(() => data.employees.filter((item) => branch === "all" || item.branchId === branch), [data.employees, branch]);
  const history = data.attendanceHistory.filter((item) => branch === "all" || item.branchId === branch);
  const present = employees.filter((item) => item.status === "PRESENT").length;
  const late = employees.filter((item) => item.status === "LATE").length;
  const absent = employees.filter((item) => item.status === "ABSENT").length;
  const pending = employees.length - present - late - absent;

  async function checkIn(employee: Employee) {
    setSaving(employee.id);
    try {
      const result = await json("/api/attendance", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: employee.id, action: "CHECK_IN" }),
      });
      toast.success(`${employee.name} tercatat masuk pukul ${result.checkInTime}.`);
      await reload();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Presensi gagal."); }
    finally { setSaving(null); }
  }

  async function markAbsent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!absentEmployee) return;
    setSaving(absentEmployee.id);
    const form = new FormData(event.currentTarget);
    try {
      await json("/api/attendance", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: absentEmployee.id, action: "ABSENT", note: form.get("note") }),
      });
      toast.success(`${absentEmployee.name} ditandai tidak masuk.`);
      setAbsentEmployee(null); await reload();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Status gagal disimpan."); }
    finally { setSaving(null); }
  }

  async function saveEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    setSaving("employee"); const form = new FormData(event.currentTarget);
    const isNew = editing === "new";
    try {
      await json("/api/employees", {
        method: isNew ? "POST" : "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: isNew ? undefined : editing.id, branchId: form.get("branchId"), name: form.get("name"),
          position: form.get("position"), phone: form.get("phone"), scheduledStart: form.get("scheduledStart"),
        }),
      });
      toast.success(isNew ? "Karyawan berhasil ditambahkan." : "Data karyawan berhasil diperbarui.");
      setEditing(null); await reload();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Data gagal disimpan."); }
    finally { setSaving(null); }
  }

  const summary = [
    ["Hadir Tepat Waktu", present, CheckCircle2, "bg-emerald-50 text-emerald-700"],
    ["Terlambat", late, Clock3, "bg-amber-50 text-amber-700"],
    ["Belum Presensi", pending, AlertCircle, "bg-blue-50 text-blue-700"],
    ["Tidak Masuk", absent, UserX, "bg-red-50 text-red-700"],
  ] as const;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-sm font-bold text-[#991b1b]">PRESENSI HARI INI</p><h1 className="mt-1 text-2xl font-black">Kehadiran karyawan</h1><p className="mt-1 text-sm text-slate-500">Jam menggunakan waktu Indonesia Barat (WIB).</p></div>
      <Button onClick={() => setEditing("new")} className="bg-[#991b1b] hover:bg-[#7f1d1d]"><Plus/> Tambah Karyawan</Button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{summary.map(([label, value, Icon, color]) => <Card key={label} className="gap-2 py-5"><CardContent className="flex items-center justify-between px-5"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-black">{value}</p></div><div className={`grid size-11 place-items-center rounded-xl ${color}`}><Icon className="size-5"/></div></CardContent></Card>)}</div>

    <Card className="gap-0 overflow-hidden py-0">
      <div className="border-b px-5 py-4"><h2 className="font-black">Daftar Karyawan Hari Ini</h2><p className="text-sm text-slate-500">Jam masuk aktual akan dibandingkan dengan jadwal masing-masing.</p></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="pl-5">Karyawan</TableHead><TableHead>Cabang</TableHead><TableHead>Jadwal Masuk</TableHead><TableHead>Jam Datang</TableHead><TableHead>Status</TableHead><TableHead className="pr-5 text-right">Aksi</TableHead></TableRow></TableHeader><TableBody>
        {employees.map((employee) => <TableRow key={employee.id}><TableCell className="pl-5"><b>{employee.name}</b><p className="text-xs text-slate-500">{employee.position}</p></TableCell><TableCell>{employee.branchName}</TableCell><TableCell className="font-semibold">{employee.scheduledStart} WIB</TableCell><TableCell className="font-black">{employee.checkInTime ? `${employee.checkInTime} WIB` : "—"}</TableCell><TableCell>{statusBadge(employee.status)}</TableCell><TableCell className="pr-5"><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEditing(employee)} aria-label={`Edit ${employee.name}`}><Pencil/></Button>{!employee.status && <><Button size="sm" variant="outline" onClick={() => setAbsentEmployee(employee)}><UserX/> Tidak Masuk</Button><Button size="sm" disabled={saving === employee.id} onClick={() => checkIn(employee)} className="bg-emerald-600 hover:bg-emerald-700">{saving === employee.id ? <Loader2 className="animate-spin"/> : <UserCheck/>} Presensi Masuk</Button></>}{employee.status === "ABSENT" && <Button size="sm" variant="outline" disabled={saving === employee.id} onClick={() => checkIn(employee)}><UserCheck/> Koreksi: Hadir</Button>}</div></TableCell></TableRow>)}
      </TableBody></Table></div>
      {!employees.length && <div className="px-5 py-12 text-center"><UserCheck className="mx-auto mb-3 size-9 text-slate-300"/><p className="font-bold">Belum ada karyawan</p><p className="text-sm text-slate-500">Tambahkan karyawan dan tentukan jam masuknya.</p></div>}
    </Card>

    <Card className="gap-0 overflow-hidden py-0"><div className="border-b px-5 py-4"><h2 className="font-black">Riwayat Presensi</h2><p className="text-sm text-slate-500">100 catatan terbaru dari seluruh hari kerja.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="pl-5">Tanggal</TableHead><TableHead>Karyawan</TableHead><TableHead>Cabang</TableHead><TableHead>Jadwal</TableHead><TableHead>Jam Datang</TableHead><TableHead>Status</TableHead><TableHead className="pr-5">Keterangan</TableHead></TableRow></TableHeader><TableBody>{history.map((item) => <TableRow key={item.id}><TableCell className="pl-5">{new Date(`${item.attendanceDate}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</TableCell><TableCell className="font-bold">{item.employeeName}</TableCell><TableCell>{item.branchName}</TableCell><TableCell>{item.scheduledStart}</TableCell><TableCell>{item.checkInTime || "—"}</TableCell><TableCell>{statusBadge(item.status)}</TableCell><TableCell className="pr-5 text-slate-500">{item.note || "—"}</TableCell></TableRow>)}</TableBody></Table></div>{!history.length && <p className="px-5 py-8 text-center text-sm text-slate-500">Belum ada riwayat presensi.</p>}</Card>

    <Dialog open={editing !== null} onOpenChange={(value) => !value && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>{editing === "new" ? "Tambah Karyawan" : "Edit Karyawan"}</DialogTitle><DialogDescription>Tentukan cabang dan jam masuk normal agar keterlambatan dapat dihitung otomatis.</DialogDescription></DialogHeader>{editing && <form onSubmit={saveEmployee} className="space-y-4"><Field label="Nama Karyawan"><Input name="name" required defaultValue={editing === "new" ? "" : editing.name} className="h-11"/></Field><div className="grid grid-cols-2 gap-3"><Field label="Cabang"><Select name="branchId" required defaultValue={editing === "new" ? (branch === "all" ? data.branches[0]?.id : branch) : editing.branchId}><SelectTrigger className="h-11 w-full"><SelectValue placeholder="Pilih cabang"/></SelectTrigger><SelectContent>{data.branches.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Jam Masuk"><Input name="scheduledStart" type="time" required defaultValue={editing === "new" ? "08:00" : editing.scheduledStart} className="h-11"/></Field></div><Field label="Jabatan"><Input name="position" required defaultValue={editing === "new" ? "Karyawan Toko" : editing.position} className="h-11"/></Field><Field label="Nomor HP"><Input name="phone" defaultValue={editing === "new" ? "" : editing.phone} className="h-11" placeholder="Opsional"/></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)}>Batal</Button><Button disabled={saving === "employee"} className="bg-[#991b1b] hover:bg-[#7f1d1d]">{saving === "employee" && <Loader2 className="animate-spin"/>} Simpan</Button></DialogFooter></form>}</DialogContent></Dialog>

    <Dialog open={absentEmployee !== null} onOpenChange={(value) => !value && setAbsentEmployee(null)}><DialogContent><DialogHeader><DialogTitle>Tandai Tidak Masuk</DialogTitle><DialogDescription>{absentEmployee?.name} akan dicatat tidak masuk hari ini.</DialogDescription></DialogHeader><form onSubmit={markAbsent} className="space-y-4"><Field label="Keterangan"><Input name="note" required className="h-11" placeholder="Contoh: izin, sakit, atau tanpa keterangan"/></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setAbsentEmployee(null)}>Batal</Button><Button disabled={saving === absentEmployee?.id} variant="destructive">{saving === absentEmployee?.id && <Loader2 className="animate-spin"/>} Simpan Tidak Masuk</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
