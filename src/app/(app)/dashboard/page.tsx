"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMeetings } from "@/context/MeetingContext";
import { useCurrentUser } from "@/context/UserContext";
import { isParticipant } from "@/lib/access";
import ParticipantHome from "@/components/layout/ParticipantHome";
import { useBookings } from "@/context/BookingContext";
import { todayNow } from "@/lib/clock";
import {
  meetingRooms,
  meetingStatusLabels,
  meetingStatusColors,
  roomStatusInfo,
} from "@/data";
import { PageError, PageLoading } from "@/components/layout/PageState";

const iconClass = "material-symbols-outlined text-xl";

function fmtDate(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export default function DashboardPage() {
  const { meetings, loading: meetingsLoading, error: meetingsError, reload: reloadMeetings } = useMeetings();
  const { bookings, loading: bookingsLoading, error: bookingsError, reload: reloadBookings } = useBookings();
  const { currentUser } = useCurrentUser();

  // ผู้เข้าร่วมได้หน้าหลักแบบเรียบง่าย ไม่มีสถิติห้อง/การจอง
  const participantView = isParticipant(currentUser.systemRole);
  const recent = meetings.filter(m => m.date < todayNow()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const upcoming = meetings.filter(m => m.date >= todayNow()).sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];

  const activeRooms = meetingRooms.filter(r => r.status === "available").length;
  const myBookings = bookings.filter(b => b.bookedById === currentUser.id).length;
  const myMeetings = meetings.filter(m =>
    m.permissions.some(p => p.userId === currentUser.id && p.type === "manager") ||
    m.organizerId === currentUser.id
  ).length;

  if (participantView) return <ParticipantHome />;

  // ตัวเลขและรายการบนแดชบอร์ดต้องไม่โชว์ 0 / "ไม่มีการประชุม" ระหว่างโหลดหรือเมื่อโหลดไม่สำเร็จ
  if ((meetingsLoading || bookingsLoading) && meetings.length === 0) return <PageLoading />;
  if (meetingsError || bookingsError) {
    return (
      <PageError
        message={meetingsError ?? bookingsError ?? ""}
        onRetry={() => { void reloadMeetings(); void reloadBookings(); }}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 pb-16 max-w-page mx-auto">
      <header className="mb-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-semibold mb-0.5">
            ยินดีต้อนรับ, {currentUser.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {currentUser.position} · {currentUser.department}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/booking"><span className={iconClass}>event_available</span>จองห้องประชุม</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/meetings/new"><span className={iconClass}>add</span>สร้างการประชุม</Link>
          </Button>
        </div>
      </header>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { icon: "event_note", label: "การประชุมที่ดูแล", value: myMeetings, color: "text-primary", bg: "bg-primary/10" },
          { icon: "bookmark", label: "การจองห้องของฉัน", value: myBookings, color: "text-chart-3", bg: "bg-chart-3/10" },
          { icon: "meeting_room", label: "ห้องพร้อมใช้งาน", value: `${activeRooms}/${meetingRooms.length}`, color: "text-chart-4", bg: "bg-chart-4/10" },
          { icon: "upcoming", label: "การประชุมที่จะมาถึง", value: upcoming.length, color: "text-chart-5", bg: "bg-chart-5/10" },
        ].map((m) => (
          <Card key={m.label} className="card-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${m.bg} flex-shrink-0`}>
                <span className={`${iconClass} ${m.color}`}>{m.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Next Meeting Banner */}
      {next && (
        <Card className="card-shadow overflow-hidden mb-5 border-none relative min-h-44 md:min-h-56 hover:shadow-md transition-shadow cursor-pointer">
          <Link href={`/meetings/${next.id}`} className="block h-full">
            <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/85 to-primary/60" />
            <div className="absolute inset-0 hero-glow" />
            <div className="relative flex flex-col justify-center p-5 md:p-8 h-full">
              <Badge className="w-fit mb-2 bg-primary-foreground/20 text-primary-foreground border border-primary-foreground/30 text-tiny">การประชุมครั้งถัดไป</Badge>
              <h2 className="text-lg md:text-2xl font-bold text-primary-foreground mb-1.5 drop-shadow-sm break-words">{next.name}</h2>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-primary-foreground/90">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">calendar_today</span>
                  {fmtDate(next.date)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">schedule</span>
                  {next.startTime} - {next.endTime}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">place</span>
                  {next.location}
                </span>
                <Badge className={`${meetingStatusColors[next.status]} text-tiny border`}>{meetingStatusLabels[next.status]}</Badge>
              </div>
            </div>
          </Link>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Upcoming meetings */}
        <Card className="lg:col-span-2 card-shadow">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm">การประชุมเร็วๆ นี้</CardTitle>
              <CardDescription className="text-xs">รายการประชุมที่ผู้ใช้เกี่ยวข้อง</CardDescription>
            </div>
            <Link href="/meetings" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              ดูทั้งหมด <span className="material-symbols-outlined text-sm">chevron_right</span>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.slice(0, 5).map((m) => (
              <Link
                key={m.id}
                href={`/meetings/${m.id}`}
                className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:border-primary/50 transition-colors"
              >
                <div className="bg-primary/10 p-2 rounded-md flex-shrink-0">
                  <span className="material-symbols-outlined text-lg text-primary">event</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground/90 leading-tight mb-1 truncate">{m.name}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{fmtDate(m.date)} · {m.startTime}-{m.endTime}</span>
                    <span>·</span>
                    <span>{m.location}</span>
                  </div>
                </div>
                <Badge className={`${meetingStatusColors[m.status]} text-tiny border`}>{meetingStatusLabels[m.status]}</Badge>
              </Link>
            ))}
            {upcoming.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">ไม่มีการประชุมที่จะมาถึง</p>
            )}
          </CardContent>
        </Card>

        {/* Recent meetings */}
        <Card className="card-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">การประชุมล่าสุดที่ผ่านมา</CardTitle>
            <CardDescription className="text-xs">การประชุมย้อนหลัง</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.map((m) => (
              <Link
                key={m.id}
                href={`/meetings/${m.id}`}
                className="flex items-start gap-3 rounded-lg border bg-card p-3 hover:border-primary/50 transition-colors"
              >
                <div className="bg-muted p-2 rounded-md flex-shrink-0">
                  <span className="material-symbols-outlined text-base text-muted-foreground">history</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground/90 leading-tight mb-1 line-clamp-2">{m.name}</p>
                  <p className="text-caption text-muted-foreground">{fmtDate(m.date)}</p>
                </div>
              </Link>
            ))}
            {recent.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">ไม่มีการประชุมย้อนหลัง</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Room availability preview */}
      <Card className="card-shadow mt-4">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">สถานะห้องประชุม</CardTitle>
            <CardDescription className="text-xs">ภาพรวมห้องประชุมทั้งหมด</CardDescription>
          </div>
          <Link href="/rooms" className="text-xs text-primary hover:underline flex items-center gap-0.5 py-2 pointer-coarse:min-h-11">
            ดูทั้งหมด <span className="material-symbols-outlined text-sm">chevron_right</span>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {meetingRooms.slice(0, 4).map((r) => {
              const status = roomStatusInfo[r.status];
              // การ์ดพาไปจองห้องนั้นได้เลย — เดิมดูเหมือนกดได้แต่แค่ขึ้น toast ซ้ำข้อมูลบนการ์ด
              return (
                <Link key={r.id} href={`/booking?room=${r.id}`} className="block rounded-xl border bg-muted/20 p-3 hover:bg-muted/40 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">
                  <div className="flex items-center justify-between mb-2">
                    <span className="material-symbols-outlined text-primary text-2xl">meeting_room</span>
                    <span className={`text-tiny px-2 py-0.5 rounded-full border ${status.color}`}>{status.label}</span>
                  </div>
                  <p className="text-sm font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.categoryLabel} · {r.capacity} ที่นั่ง</p>
                  <p className="text-caption text-muted-foreground mt-2">{r.location} {r.floor}</p>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
