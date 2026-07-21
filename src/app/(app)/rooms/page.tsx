"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { meetingRooms, roomCategoryOptions } from "@/data";

export default function RoomsPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");

  const filtered = meetingRooms.filter(r => {
    if (category !== "all" && r.category !== category) return false;
    if (q && !`${r.name} ${r.location}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const statusInfo = {
    available: { label: "พร้อมใช้งาน", color: "bg-green-100 text-green-700 border-green-200" },
    occupied: { label: "ถูกจอง", color: "bg-amber-100 text-amber-700 border-amber-200" },
    maintenance: { label: "ปิดปรับปรุง", color: "bg-slate-100 text-slate-600 border-slate-200" },
  };

  return (
    <div className="p-4 md:p-6 pb-16 max-w-[1280px] mx-auto">
      <header className="mb-5">
        <h1 className="text-lg md:text-xl font-semibold mb-0.5">ห้องประชุมทั้งหมด</h1>
        <p className="text-xs text-muted-foreground">รายการห้องประชุมและอุปกรณ์</p>
      </header>

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <Input placeholder="ค้นหาชื่อห้อง / อาคาร..." value={q} onChange={e => setQ(e.target.value)} className="max-w-sm h-9" />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 md:w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            {roomCategoryOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(r => {
          const s = statusInfo[r.status];
          return (
            <Card key={r.id} className="card-shadow hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                      <span className="material-symbols-outlined text-primary">meeting_room</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.categoryLabel}</p>
                    </div>
                  </div>
                  <Badge className={`${s.color} text-[10px] border`}>{s.label}</Badge>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">place</span>{r.location} · {r.floor}</p>
                  <p className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">group</span>รองรับ {r.capacity} ที่นั่ง</p>
                </div>
                <div className="flex flex-wrap gap-1 mt-3 mb-3">
                  {r.amenities.map((a, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{a}</span>
                  ))}
                </div>
                {r.status === "available" ? (
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <Link href="/booking">
                      <span className="material-symbols-outlined text-[16px]">event_available</span>
                      จองห้องนี้
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="w-full" disabled>
                    <span className="material-symbols-outlined text-[16px]">event_available</span>
                    ไม่พร้อมจอง
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
