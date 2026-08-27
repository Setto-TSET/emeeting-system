"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";
import { useBookings } from "@/context/BookingContext";
import { ApiError } from "@/services/api/client";
import { useCurrentUser } from "@/context/UserContext";
import { today } from "@/lib/clock";

export default function MyBookingsPage() {
  const { bookings, cancelBooking } = useBookings();
  const { currentUser } = useCurrentUser();
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("upcoming");

  // จับคู่ด้วย id — เดิมเทียบชื่อ ซึ่งพังเมื่อชื่อในข้อมูลไม่ตรงกับชื่อผู้ใช้เป๊ะๆ
  const myBookings = bookings.filter(b => b.bookedById === currentUser.id);
  const filtered = myBookings.filter(b => {
    if (filter === "upcoming") return b.date >= today && b.status !== "cancelled";
    if (filter === "past") return b.date < today;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const cancel = async (id: string) => {
    try {
      await cancelBooking(id);
      toast.success("ยกเลิกการจองแล้ว");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "ยกเลิกการจองไม่สำเร็จ");
    }
  };

  const statusInfo = {
    confirmed: { label: "ยืนยันแล้ว", color: "bg-green-100 text-green-700 border-green-200" },
    pending: { label: "รอดำเนินการ", color: "bg-amber-100 text-amber-700 border-amber-200" },
    cancelled: { label: "ยกเลิกแล้ว", color: "bg-slate-100 text-slate-500 border-slate-200" },
  };

  return (
    <div className="p-4 md:p-6 pb-16 max-w-[1280px] mx-auto">
      <header className="mb-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-semibold mb-0.5">การจองของฉัน</h1>
          <p className="text-xs text-muted-foreground">รายการห้องประชุมที่คุณจองไว้</p>
        </div>
        <Button asChild size="sm">
          <Link href="/booking"><span className="material-symbols-outlined text-[18px]">add</span>จองห้องใหม่</Link>
        </Button>
      </header>

      <div className="flex gap-2 mb-4">
        {[{ v: "upcoming", l: "กำลังจะมาถึง" }, { v: "past", l: "ผ่านมาแล้ว" }, { v: "all", l: "ทั้งหมด" }].map(t => (
          <Button
            key={t.v}
            variant={filter === t.v ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(t.v as "all" | "upcoming" | "past")}
          >
            {t.l}
          </Button>
        ))}
      </div>

      <Card className="card-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">รายการจอง ({filtered.length})</CardTitle>
          <CardDescription className="text-xs">คลิกเพื่อดูรายละเอียด</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <span className="material-symbols-outlined text-[40px] mb-2">event_busy</span>
              <p className="text-sm">ยังไม่มีการจองในช่วงเวลานี้</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(b => {
                const s = statusInfo[b.status];
                return (
                  <div key={b.id} className="rounded-lg border p-3 hover:border-primary/50 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      <div className="flex-shrink-0 flex md:flex-col items-center md:justify-center rounded-md bg-primary/10 p-2 md:w-16 gap-1 md:gap-0">
                        <span className="text-primary text-lg font-bold">{new Date(b.date).getDate()}</span>
                        <span className="text-[10px] text-primary">{new Date(b.date).toLocaleDateString("th-TH", { month: "short" })}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-1 gap-2">
                          <p className="text-sm font-semibold leading-tight">{b.title}</p>
                          <Badge className={`${s.color} text-[10px] border shrink-0`}>{s.label}</Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">meeting_room</span>{b.roomName}</span>
                          <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">schedule</span>{b.startTime}-{b.endTime}</span>
                          <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">group</span>{b.attendees} คน</span>
                          <span className="text-muted-foreground/70">·</span>
                          <span className="truncate">{b.purpose}</span>
                        </div>
                      </div>
                      {b.status !== "cancelled" && b.date >= today && (
                        <Button size="sm" variant="destructive" onClick={() => cancel(b.id)} className="shrink-0">
                          ยกเลิก
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
