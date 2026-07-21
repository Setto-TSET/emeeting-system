"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { committees } from "@/data";
import { useMeetings } from "@/context/MeetingContext";

export default function CommitteesPage() {
  const { meetings } = useMeetings();

  return (
    <div className="p-4 md:p-6 pb-16 max-w-[1280px] mx-auto">
      <header className="mb-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-semibold mb-0.5">คณะทำงาน</h1>
          <p className="text-xs text-muted-foreground">รายการคณะทำงาน / คณะกรรมการทั้งหมด</p>
        </div>
        <Button asChild size="sm">
          <Link href="/meetings/new"><span className="material-symbols-outlined text-[18px]">add</span>สร้างการประชุม</Link>
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {committees.map(c => {
          const cMeetings = meetings.filter(m => m.committee === c.name);
          return (
            <Card key={c.id} className="card-shadow hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-primary">diversity_3</span>
                  </div>
                  <div>
                    <CardTitle className="text-sm">{c.name}</CardTitle>
                    <CardDescription className="text-xs">{c.members} สมาชิก · {cMeetings.length} การประชุม</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 mb-3">
                  <p className="text-xs text-muted-foreground mb-1">การประชุมล่าสุด</p>
                  {cMeetings.slice(0, 2).map(m => (
                    <Link key={m.id} href={`/meetings/${m.id}`} className="block text-xs hover:text-primary transition-colors truncate">
                      · {m.name}
                    </Link>
                  ))}
                  {cMeetings.length === 0 && <p className="text-xs text-muted-foreground italic">ยังไม่มีการประชุม</p>}
                </div>
                <Button size="sm" variant="outline" className="w-full" asChild>
                  <Link href={`/meetings?committee=${encodeURIComponent(c.name)}`}>ดูการประชุมทั้งหมด</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
