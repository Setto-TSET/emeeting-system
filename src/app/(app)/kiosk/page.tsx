"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMeetings } from "@/context/MeetingContext";
import { useCurrentUser } from "@/context/UserContext";
import { meetingStatusLabels, meetingStatusColors, meetingRooms } from "@/data";
import { todayNow, currentClockTime } from "@/lib/clock";
import { can } from "@/lib/authz";
import { PageError, PageLoading } from "@/components/layout/PageState";

export default function KioskPage() {
  const router = useRouter();
  const { meetings, loading: meetingsLoading, error: meetingsError, reload: reloadMeetings } = useMeetings();
  const { currentUser } = useCurrentUser();
  const [clockTime, setClockTime] = useState(currentClockTime());

  useEffect(() => {
    const interval = setInterval(() => setClockTime(currentClockTime()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // จอหน้าห้องเปิดค้างทั้งวันโดยไม่มีใครกดรีเฟรช — ดึงรายการใหม่ทุกนาที ทั้งเพื่อเห็นประชุมที่เพิ่งเปิด
  // และเพื่อหายจากหน้าข้อผิดพลาดเองเมื่อ server กลับมา
  useEffect(() => {
    const interval = setInterval(() => void reloadMeetings(), 60_000);
    return () => clearInterval(interval);
  }, [reloadMeetings]);

  const room = meetingRooms.find((r) => r.id === currentUser.roomId);
  const roomName = room?.name ?? currentUser.name;

  const todayMeetings = meetings
    .filter((m) => m.date === todayNow() && can(currentUser, "meeting.view", m))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const currentMeeting = todayMeetings.find((m) => m.status === "in_progress");
  const upcomingMeetings = todayMeetings.filter(
    (m) => m.status !== "in_progress" && m.status !== "endorsed"
  );
  const pastMeetings = todayMeetings.filter((m) => m.status === "endorsed");

  const canJoin = (m: typeof meetings[0]) =>
    m.status === "in_progress" || m.status === "notified";

  // ระหว่างโหลดหรือโหลดไม่สำเร็จ ห้ามแสดงสถานะว่าง — ผู้ใช้จะเข้าใจว่าไม่มีการประชุม
  if (meetingsLoading && meetings.length === 0) return <PageLoading />;
  if (meetingsError && meetings.length === 0) return <PageError message={meetingsError} onRetry={() => void reloadMeetings()} />;

  return (
    <div className="min-h-dvh bg-background p-6 md:p-10">
      {/* Header — ชื่อห้อง + นาฬิกา */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-3xl text-primary">tv</span>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{roomName}</h1>
            <p className="text-sm text-muted-foreground">
              {room?.location} · {room?.categoryLabel} · จุ {room?.capacity} คน
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-4xl md:text-5xl font-mono font-light tabular-nums">{clockTime}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(`${todayNow()}T00:00`).toLocaleDateString("th-TH", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      </header>

      {/* ประชุมที่กำลังดำเนินการอยู่ */}
      {currentMeeting && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive/70 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
            </span>
            <h2 className="text-lg font-semibold text-destructive">กำลังประชุม</h2>
          </div>
          <Card className="border-2 border-destructive/30 bg-destructive/10">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl md:text-2xl font-semibold mb-2">
                    {currentMeeting.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-lg">schedule</span>
                      {currentMeeting.startTime} – {currentMeeting.endTime}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-lg">groups</span>
                      {currentMeeting.participants.length} คน
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-lg">person</span>
                      {currentMeeting.organizer}
                    </span>
                  </div>
                  {currentMeeting.agenda.length > 0 && (
                    <div className="mt-3 text-sm">
                      <span className="font-medium">วาระ: </span>
                      {currentMeeting.agenda.map((a) => a.title).join(" · ")}
                    </div>
                  )}
                </div>
                <Button
                  size="lg"
                  className="text-base px-8 py-6 bg-destructive hover:bg-destructive flex-shrink-0"
                  onClick={() => router.push(`/live/${currentMeeting.id}`)}
                >
                  <span className="material-symbols-outlined mr-2">videocam</span>
                  เข้าร่วมประชุม
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ประชุมวันนี้ที่ยังไม่เริ่ม */}
      {upcomingMeetings.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-2xl">event</span>
            ประชุมวันนี้ ({upcomingMeetings.length})
          </h2>
          <div className="grid gap-3">
            {upcomingMeetings.map((m) => (
              <Card key={m.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="text-center flex-shrink-0 w-20">
                        <p className="text-xl font-mono font-semibold tabular-nums">
                          {m.startTime}
                        </p>
                        <p className="text-xs text-muted-foreground">{m.endTime}</p>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-base truncate">{m.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {m.organizer} · {m.participants.length} คน
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-xs ${meetingStatusColors[m.status]}`}
                      >
                        {meetingStatusLabels[m.status]}
                      </Badge>
                      {canJoin(m) && (
                        <Button
                          size="sm"
                          onClick={() => router.push(`/live/${m.id}`)}
                        >
                          <span className="material-symbols-outlined text-base mr-1">
                            videocam
                          </span>
                          เข้าร่วม
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ประชุมที่จบแล้ว */}
      {pastMeetings.length > 0 && (
        <section className="mb-8 opacity-60">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">
            ประชุมที่จบแล้ว ({pastMeetings.length})
          </h2>
          <div className="grid gap-2">
            {pastMeetings.map((m) => (
              <Card key={m.id} className="bg-muted/30">
                <CardContent className="p-3 flex items-center gap-4">
                  <span className="text-sm font-mono tabular-nums w-20 text-center">
                    {m.startTime}–{m.endTime}
                  </span>
                  <span className="text-sm truncate">{m.name}</span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    {meetingStatusLabels[m.status]}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ไม่มีประชุมวันนี้ */}
      {todayMeetings.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[40dvh] text-center">
          <span className="material-symbols-outlined text-6xl text-muted-foreground/40 mb-4">
            event_busy
          </span>
          <p className="text-xl font-medium text-muted-foreground">
            ไม่มีการประชุมในห้องนี้วันนี้
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            ระบบจะแสดงการประชุมโดยอัตโนมัติเมื่อถึงเวลา
          </p>
        </div>
      )}

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur border-t px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>e-Meeting Kiosk · {roomName}</span>
        <span>อัพเดทอัตโนมัติ</span>
      </footer>
    </div>
  );
}
