"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMeetings } from "@/context/MeetingContext";
import { useCurrentUser } from "@/context/UserContext";
import { canViewFile, isMyMeeting } from "@/data";
import { today } from "@/lib/clock";

// ═══════════════════════════════════════════
// หน้าหลักของ "ผู้เข้าร่วมประชุม"
// ไม่มีสถิติห้องว่าง ไม่มีปุ่มจอง ไม่มีปุ่มสร้างประชุม
// มีแค่: ประชุมถัดไปของฉัน + ทางลัดไปรายการประชุมและเอกสาร
// ═══════════════════════════════════════════

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export default function ParticipantHome() {
  const { meetings } = useMeetings();
  const { currentUser } = useCurrentUser();

  // เฉพาะการประชุมที่ตัวเองเกี่ยวข้อง — เกณฑ์เดียวกับหน้า /portal
  const myMeetings = meetings.filter((m) => isMyMeeting(currentUser, m));

  const live = myMeetings.find((m) => m.status === "in_progress");
  const upcoming = myMeetings
    .filter((m) => m.date >= today && m.status !== "in_progress")
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = live ?? upcoming[0];

  const myDocCount = myMeetings.reduce(
    (sum, m) => sum + m.files.filter((f) => canViewFile(f, currentUser, m)).length,
    0
  );

  return (
    <div className="p-4 md:p-6 pb-16 max-w-[900px] mx-auto">
      <header className="mb-5">
        <h1 className="text-lg md:text-xl font-semibold mb-0.5">สวัสดี, {currentUser.name}</h1>
        <p className="text-xs text-muted-foreground">
          {currentUser.position} · {currentUser.department}
        </p>
      </header>

      {/* ประชุมถัดไป — การ์ดใหญ่ใบเดียว กดเข้าห้องได้เลย */}
      {next ? (
        <Card className="card-shadow overflow-hidden mb-5 border-none relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/85 to-primary/60" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_50%)]" />
          <div className="relative p-5 md:p-7">
            <Badge className="w-fit mb-2 bg-white/20 text-white border border-white/30 text-[10px]">
              {live ? "กำลังประชุมอยู่ตอนนี้" : "การประชุมครั้งถัดไปของคุณ"}
            </Badge>
            <h2 className="text-lg md:text-2xl font-bold text-white mb-2 drop-shadow-sm">{next.name}</h2>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-white/90 mb-5">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                {fmtDate(next.date)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">schedule</span>
                {next.startTime} - {next.endTime} น.
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">place</span>
                {next.location}
              </span>
            </div>
            <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 font-bold">
              <Link href={`/live/${next.id}`}>
                <span className="material-symbols-outlined text-[20px] mr-1.5">video_call</span>
                เข้าห้องประชุม
              </Link>
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="card-shadow mb-5">
          <CardContent className="py-10 text-center">
            <span className="material-symbols-outlined text-[40px] text-muted-foreground mb-2">event_busy</span>
            <p className="text-sm font-medium">ยังไม่มีการประชุมที่จะมาถึง</p>
            <p className="text-xs text-muted-foreground mt-1">เมื่อมีผู้เชิญคุณเข้าประชุม จะแสดงที่นี่</p>
          </CardContent>
        </Card>
      )}

      {/* ทางลัด 2 ใบ — ตรงกับเมนูที่ผู้เข้าร่วมมี */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/portal">
          <Card className="card-shadow h-full hover:border-primary/50 transition-colors">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <span className="material-symbols-outlined text-primary">event_note</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">การประชุมของฉัน</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ทั้งหมด {myMeetings.length} รายการ
                </p>
              </div>
              <span className="material-symbols-outlined text-muted-foreground ml-auto">chevron_right</span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/documents">
          <Card className="card-shadow h-full hover:border-primary/50 transition-colors">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-chart-3/10 shrink-0">
                <span className="material-symbols-outlined text-chart-3">folder_shared</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">เอกสารการประชุม</p>
                <p className="text-xs text-muted-foreground mt-0.5">ดูได้ {myDocCount} ฉบับ</p>
              </div>
              <span className="material-symbols-outlined text-muted-foreground ml-auto">chevron_right</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
