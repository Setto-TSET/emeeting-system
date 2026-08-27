"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import Link from "next/link";
import { meetingRooms, roomCategoryOptions, Booking, Room } from "@/data";
import { useBookings } from "@/context/BookingContext";
import { ApiError } from "@/services/api/client";
import { useCurrentUser } from "@/context/UserContext";
import { today } from "@/lib/clock";

const iconClass = "material-symbols-outlined text-[18px]";

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const THAI_DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function pad(n: number) { return n.toString().padStart(2, "0"); }
function toISO(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export default function BookingPage() {
  const [current, setCurrent] = useState(new Date(2026, 6, 15));
  const [selectedDate, setSelectedDate] = useState<string>(toISO(new Date(2026, 6, 15)));
  const [category, setCategory] = useState("all");
  const [attendees, setAttendees] = useState("6");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [searched, setSearched] = useState(false);
  const { bookings, addBooking } = useBookings();
  const { currentUser } = useCurrentUser();
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [extraRoom, setExtraRoom] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const days = useMemo(() => {
    const y = current.getFullYear(), m = current.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let i = 1; i <= daysInMonth; i++) arr.push(new Date(y, m, i));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [current]);

  const bookingsByDate = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (const b of bookings) {
      if (!map[b.date]) map[b.date] = [];
      map[b.date].push(b);
    }
    return map;
  }, [bookings]);

  const availableRooms = useMemo(() => {
    if (!searched) return [];
    const nAttendees = parseInt(attendees) || 1;
    return meetingRooms.filter(r => {
      if (r.status !== "available") return false;
      if (category !== "all" && r.category !== category) return false;
      if (r.capacity < nAttendees) return false;
      const conflict = bookings.some(b =>
        b.roomId === r.id && b.date === selectedDate &&
        !(b.endTime <= startTime || b.startTime >= endTime) &&
        b.status !== "cancelled"
      );
      return !conflict;
    });
  }, [searched, category, attendees, startTime, endTime, selectedDate, bookings]);

  const selectedDayBookings = bookingsByDate[selectedDate] || [];

  const openForm = (r: Room) => { setSelectedRoom(r); setFormOpen(true); };

  const submit = async () => {
    if (!selectedRoom || !title.trim()) { toast.error("กรุณากรอกหัวข้อการประชุม"); return; }
    const newB: Booking = {
      id: `BK-${Date.now()}`,
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      title: title.trim(),
      bookedById: currentUser.id,
      bookedBy: currentUser.name,
      department: currentUser.department,
      date: selectedDate,
      startTime, endTime,
      attendees: parseInt(attendees) || 1,
      purpose: purpose.trim(),
      status: "confirmed",
      extraRooms: extraRoom ? [extraRoom] : undefined,
    };
    // server เป็นผู้ตัดสินการชนเวลาขั้นสุดท้าย — รายการห้องว่างที่แสดงอยู่อาจเก่าไปแล้ว
    // ถ้ามีคนอื่นจองแทรกระหว่างที่กรอกฟอร์ม จะได้ 409 กลับมาตรงนี้
    setSubmitting(true);
    try {
      await addBooking(newB);
      toast.success("จองห้องประชุมสำเร็จ", { description: `${selectedRoom.name} · ${selectedDate} · ${startTime}-${endTime}` });
      setFormOpen(false);
      setTitle(""); setPurpose(""); setExtraRoom("");
      setSelectedRoom(null);
      setSearched(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "จองห้องประชุมไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-16 max-w-[1400px] mx-auto">
      <header className="mb-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-semibold mb-0.5">ปฏิทินและจองห้องประชุม</h1>
          <p className="text-xs text-muted-foreground">ค้นหาห้องประชุมที่ว่างและทำการจอง</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/booking/my-bookings"><span className={iconClass}>bookmark</span>ดูการจองของฉัน</Link>
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Search Form */}
        <Card className="lg:col-span-1 card-shadow h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">ค้นหาห้องประชุมที่จองได้</CardTitle>
            <CardDescription className="text-xs">กำหนดเงื่อนไขเพื่อค้นหา</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">วันที่ต้องการใช้งาน<span className="text-destructive">*</span></label>
              <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">เวลาเริ่ม<span className="text-destructive">*</span></label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">เวลาสิ้นสุด<span className="text-destructive">*</span></label>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-9" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">หมวดหมู่ห้อง</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roomCategoryOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">จำนวนผู้เข้าร่วม<span className="text-destructive">*</span></label>
              <Input type="number" min="1" value={attendees} onChange={e => setAttendees(e.target.value)} className="h-9" />
            </div>
            <Button className="w-full" onClick={() => setSearched(true)}>
              <span className={iconClass}>search</span> ค้นหาห้อง
            </Button>
          </CardContent>
        </Card>

        {/* Calendar */}
        <Card className="lg:col-span-2 card-shadow">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">ปฏิทินการจองห้องประชุม</CardTitle>
              <CardDescription className="text-xs">คลิกเลือกวันที่เพื่อดูการจอง</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon-sm" variant="ghost" onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1))}>
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </Button>
              <span className="text-sm font-semibold min-w-[110px] text-center">
                {THAI_MONTHS[current.getMonth()]} {current.getFullYear() + 543}
              </span>
              <Button size="icon-sm" variant="ghost" onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1))}>
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {THAI_DAYS.map(d => <div key={d} className="text-[11px] font-semibold text-muted-foreground py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d, i) => {
                if (!d) return <div key={i} className="aspect-square" />;
                const iso = toISO(d);
                const dayBookings = bookingsByDate[iso] || [];
                const isSelected = iso === selectedDate;
                const isToday = iso === today;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(iso)}
                    className={`aspect-square rounded-md border text-left p-1 hover:border-primary transition-colors ${
                      isSelected ? "border-primary bg-primary/10" : "border-border bg-card"
                    }`}
                  >
                    <div className={`text-xs font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>{d.getDate()}</div>
                    {dayBookings.slice(0, 2).map((b, j) => (
                      <div key={j} className="text-[8px] px-1 rounded bg-primary/15 text-primary truncate mt-0.5">{b.startTime} {b.title.substring(0, 8)}</div>
                    ))}
                    {dayBookings.length > 2 && <div className="text-[8px] text-muted-foreground mt-0.5">+{dayBookings.length - 2}</div>}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results / Day view */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Available rooms */}
        <Card className="lg:col-span-2 card-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {searched ? `ห้องที่ว่างในช่วง ${startTime}-${endTime} (${availableRooms.length} ห้อง)` : "ห้องประชุมที่ค้นพบ"}
            </CardTitle>
            <CardDescription className="text-xs">คลิก &quot;จองห้องนี้&quot; เพื่อดำเนินการต่อ</CardDescription>
          </CardHeader>
          <CardContent>
            {!searched ? (
              <div className="text-center py-12 text-muted-foreground">
                <span className="material-symbols-outlined text-[40px] mb-2">search</span>
                <p className="text-sm">กรอกเงื่อนไขและกด &quot;ค้นหาห้อง&quot; เพื่อดูห้องที่ว่าง</p>
              </div>
            ) : availableRooms.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <span className="material-symbols-outlined text-[40px] mb-2">event_busy</span>
                <p className="text-sm">ไม่พบห้องที่ตรงเงื่อนไข ลองปรับเวลาหรือประเภทห้อง</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableRooms.map(r => (
                  <div key={r.id} className="rounded-xl border p-3 hover:border-primary transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.categoryLabel}</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{r.capacity} ที่นั่ง</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">place</span>
                      {r.location} {r.floor}
                    </p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {r.amenities.slice(0, 3).map((a, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{a}</span>
                      ))}
                    </div>
                    <Button size="sm" className="w-full" onClick={() => openForm(r)}>
                      <span className={iconClass}>event_available</span> จองห้องนี้
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selected day bookings */}
        <Card className="card-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">การจองในวันที่เลือก</CardTitle>
            <CardDescription className="text-xs">
              {new Date(selectedDate).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedDayBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">ยังไม่มีการจองในวันนี้</p>
            ) : selectedDayBookings.map(b => (
              <div key={b.id} className="rounded-lg border p-2.5">
                <div className="flex items-start justify-between mb-1">
                  <p className="text-xs font-semibold flex-1 line-clamp-2">{b.title}</p>
                  <Badge className={`text-[9px] ml-2 ${b.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {b.status === "confirmed" ? "ยืนยันแล้ว" : "รอดำเนินการ"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{b.roomName}</p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">schedule</span>{b.startTime}-{b.endTime}</span>
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">group</span>{b.attendees}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Booking Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>จองห้องประชุม — {selectedRoom?.name}</DialogTitle>
            <DialogDescription>
              กรอกรายละเอียดการจอง (ช่องที่มีเครื่องหมาย <span className="text-destructive">*</span> จำเป็นต้องกรอก)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">หัวข้อการประชุม<span className="text-destructive">*</span></label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="เช่น ประชุมทีมพัฒนา ครั้งที่ 8/2569" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">วันที่</label>
                <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">จำนวนผู้เข้าร่วม<span className="text-destructive">*</span></label>
                <Input type="number" value={attendees} onChange={e => setAttendees(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">เวลาเริ่ม<span className="text-destructive">*</span></label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">เวลาสิ้นสุด<span className="text-destructive">*</span></label>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">วัตถุประสงค์</label>
              <Input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="เช่น ประชุมประจำสัปดาห์" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ห้องประชุมเสริม (ถ้ามี)</label>
              <Select value={extraRoom} onValueChange={setExtraRoom}>
                <SelectTrigger className="w-full"><SelectValue placeholder="ไม่ต้องการห้องเสริม" /></SelectTrigger>
                <SelectContent>
                  {meetingRooms.filter(r => r.id !== selectedRoom?.id).map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground mb-1">ข้อมูลห้องประชุม</p>
              <p>{selectedRoom?.categoryLabel} · {selectedRoom?.capacity} ที่นั่ง · {selectedRoom?.location} {selectedRoom?.floor}</p>
              <p className="mt-1">อุปกรณ์: {selectedRoom?.amenities.join(", ")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>ยกเลิก</Button>
            <Button onClick={submit} disabled={submitting}>{submitting ? "กำลังจอง..." : "ยืนยันการจอง"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
