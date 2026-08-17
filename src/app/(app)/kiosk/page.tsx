"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMeetings } from "@/context/MeetingContext";
import { useCurrentUser } from "@/context/UserContext";
import { meetingStatusLabels, meetingStatusColors, meetingRooms } from "@/data";
import { today, currentClockTime } from "@/lib/clock";
import { can } from "@/lib/authz";

export default function KioskPage() {
  const router = useRouter();
  const { meetings } = useMeetings();
  const { currentUser } = useCurrentUser();
  const [clockTime, setClockTime] = useState(currentClockTime());

  useEffect(() => {
    const interval = setInterval(() => setClockTime(currentClockTime()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const room = meetingRooms.find((r) => r.id === currentUser.roomId);
  const roomName = room?.name ?? currentUser.name;

  const todayMeetings = meetings
    .filter((m) => m.date === today && can(currentUser, "meeting.view", m))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const currentMeeting = todayMeetings.find((m) => m.status === "in_progress");
  const upcomingMeetings = todayMeetings.filter(
    (m) => m.status !== "in_progress" && m.status !== "endorsed"
  );
  const pastMeetings = todayMeetings.filter((m) => m.status === "endorsed");

  const canJoin = (m: typeof meetings[0]) =>
    m.status === "in_progress" || m.status === "notified";

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      {/* Header — ชื่อห้อง + นาฬิกา */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-100">
            <span className="material-symbols-outlined text-[32px] text-teal-700">tv</span>
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
            {new Date(`${today}T00:00`).toLocaleDateString("th-TH", {
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
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <h2 className="text-lg font-semibold text-red-600">กำลังประชุม</h2>
          </div>
          <Card className="border-2 border-red-300 bg-red-50/50">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl md:text-2xl font-semibold mb-2">
                    {currentMeeting.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px]">schedule</span>
                      {currentMeeting.startTime} – {currentMeeting.endTime}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px]">groups</span>
                      {currentMeeting.participants.length} คน
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px]">person</span>
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
                  className="text-base px-8 py-6 bg-red-600 hover:bg-red-700 flex-shrink-0"
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
            <span className="material-symbols-outlined text-[22px]">event</span>
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
                          <span className="material-symbols-outlined text-[16px] mr-1">
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
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <span className="material-symbols-outlined text-[64px] text-muted-foreground/40 mb-4">
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
