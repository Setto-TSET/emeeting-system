"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { meetingStatusLabels, meetingStatusColors, committees, MeetingStatus } from "@/data";
import { useMeetings } from "@/context/MeetingContext";

function MeetingsPageContent() {
  const { meetings } = useMeetings();
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  const [committee, setCommittee] = useState(searchParams.get("committee") || "all");
  const [status, setStatus] = useState<"all" | MeetingStatus>("all");

  const filtered = meetings.filter(m => {
    if (q && !`${m.name} ${m.shortName}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (committee !== "all" && m.committee !== committee) return false;
    if (status !== "all" && m.status !== status) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-4 md:p-6 pb-16 max-w-[1400px] mx-auto">
      <header className="mb-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-semibold mb-0.5">รายการการประชุม</h1>
          <p className="text-xs text-muted-foreground">ค้นหาและจัดการการประชุมทั้งหมด</p>
        </div>
        <Button asChild size="sm">
          <Link href="/meetings/new"><span className="material-symbols-outlined text-[18px]">add</span>สร้างการประชุม</Link>
        </Button>
      </header>

      <Card className="card-shadow mb-4">
        <CardContent className="p-4 flex flex-col md:flex-row gap-2">
          <Input placeholder="ค้นหาชื่อการประชุม..." value={q} onChange={e => setQ(e.target.value)} className="max-w-sm h-9" />
          <Select value={committee} onValueChange={setCommittee}>
            <SelectTrigger className="h-9 md:w-64"><SelectValue placeholder="ทุกคณะ" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกคณะทำงาน</SelectItem>
              {committees.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={v => setStatus(v as "all" | MeetingStatus)}>
            <SelectTrigger className="h-9 md:w-56"><SelectValue placeholder="ทุกสถานะ" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสถานะ</SelectItem>
              {Object.entries(meetingStatusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {filtered.map(m => (
          <Link
            key={m.id}
            href={`/meetings/${m.id}`}
            className="block rounded-xl border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-shrink-0 flex md:flex-col items-center md:justify-center rounded-lg bg-primary/10 p-3 md:w-20 gap-2 md:gap-0">
                <span className="text-primary text-2xl font-bold">{new Date(m.date).getDate()}</span>
                <span className="text-[11px] text-primary">{new Date(m.date).toLocaleDateString("th-TH", { month: "short" })} {new Date(m.date).getFullYear() + 543}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight mb-0.5">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.committee} · {m.type}</p>
                  </div>
                  <Badge className={`${meetingStatusColors[m.status]} text-[10px] border shrink-0`}>{meetingStatusLabels[m.status]}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-2">
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">schedule</span>{m.startTime}-{m.endTime}</span>
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">place</span>{m.location}</span>
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">group</span>{m.participants.length} คน</span>
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">person</span>ผู้จัด: {m.organizer}</span>
                  {m.conferenceLink && <span className="flex items-center gap-1 text-primary"><span className="material-symbols-outlined text-[13px]">videocam</span>ประชุมทางไกล</span>}
                </div>
              </div>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <span className="material-symbols-outlined text-[40px] mb-2">event_busy</span>
            <p className="text-sm">ไม่พบการประชุมที่ตรงเงื่อนไข</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MeetingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-xs text-muted-foreground">กำลังโหลดข้อมูล...</div>}>
      <MeetingsPageContent />
    </Suspense>
  );
}
