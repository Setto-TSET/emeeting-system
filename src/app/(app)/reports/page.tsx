"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { meetingStatusLabels, canViewFile, MeetingFile, Meeting } from "@/data";
import { useMeetings } from "@/context/MeetingContext";
import { useCurrentUser } from "@/context/UserContext";
import { DocumentLightbox } from "@/components/meeting/DocumentPreview";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

const isReport = (f: MeetingFile) => f.type === "report_draft" || f.type === "report_final";

export default function ReportsPage() {
  const [q, setQ] = useState("");
  const { meetings } = useMeetings();
  const { currentUser } = useCurrentUser();

  // เปิดอ่านรายงานในเว็บ — ระบบไม่มีการดาวน์โหลดไฟล์ออก
  const [previewFile, setPreviewFile] = useState<MeetingFile | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewZoom, setPreviewZoom] = useState(100);
  const openPreview = (f: MeetingFile) => {
    setPreviewFile(f); setPreviewPage(1); setPreviewZoom(100);
  };

  /**
   * รายงานที่ผู้ใช้คนนี้มีสิทธิ์เห็นเท่านั้น
   * เดิมหน้านี้ไม่เคยเช็ค canViewFile เลย — รายงานที่ตั้ง restricted ไว้ถูกแจกให้ทุกคน
   */
  const reportsByMeeting = new Map<string, MeetingFile[]>();
  const withReports: Meeting[] = [];
  for (const m of meetings) {
    const visible = m.files.filter((f) => isReport(f) && canViewFile(f, currentUser, m));
    if (visible.length > 0) {
      reportsByMeeting.set(m.id, visible);
      withReports.push(m);
    }
  }

  const filtered = withReports.filter(m => !q || m.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-4 md:p-6 pb-16 max-w-[1280px] mx-auto">
      <header className="mb-5">
        <h1 className="text-lg md:text-xl font-semibold mb-0.5">รายงานการประชุม</h1>
        <p className="text-xs text-muted-foreground">รายงานที่ระบบสร้างและรายงานฉบับสมบูรณ์ที่อัปโหลด</p>
      </header>

      <Card className="card-shadow mb-4">
        <CardContent className="p-4 flex flex-wrap gap-2">
          <Input placeholder="ค้นหาชื่อการประชุม..." value={q} onChange={e => setQ(e.target.value)} className="max-w-sm h-9" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filtered.map(m => (
          <Card key={m.id} className="card-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-sm leading-tight">{m.name}</CardTitle>
                  <CardDescription className="text-xs mt-1">{fmtDate(m.date)} · {m.committee}</CardDescription>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">{meetingStatusLabels[m.status]}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {(reportsByMeeting.get(m.id) ?? []).map(f => (
                <div key={f.id} className="rounded-lg border p-2.5 flex items-center gap-2 hover:border-primary/50 transition-colors">
                  <span className="material-symbols-outlined text-primary text-[20px]">
                    {f.type === "report_final" ? "verified" : "description"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{f.name}</p>
                    <p className="text-[11px] text-muted-foreground">{f.uploadedAt} · {f.size}</p>
                  </div>
                  <Badge className="text-[10px]" variant={f.type === "report_final" ? "default" : "secondary"}>
                    {f.type === "report_final" ? "ฉบับสมบูรณ์" : "ร่าง"}
                  </Badge>
                  <Button size="sm" variant="ghost" className="text-primary shrink-0" onClick={() => openPreview(f)}>
                    <span className="material-symbols-outlined text-[16px] mr-1">visibility</span>
                    ดูเอกสาร
                  </Button>
                </div>
              ))}
              <div className="flex justify-end pt-1">
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/meetings/${m.id}`}>ดูรายละเอียดการประชุม →</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="lg:col-span-2 text-center py-16 text-muted-foreground">
            <span className="material-symbols-outlined text-[40px] mb-2">description</span>
            <p className="text-sm">ยังไม่มีรายงาน</p>
          </div>
        )}
      </div>

      {previewFile && (
        <DocumentLightbox
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          currentPage={previewPage}
          setCurrentPage={setPreviewPage}
          zoom={previewZoom}
          setZoom={setPreviewZoom}
        />
      )}
    </div>
  );
}
