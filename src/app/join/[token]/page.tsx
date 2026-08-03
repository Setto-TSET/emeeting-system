"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { verifyToken, markTokenUsed, type InviteToken } from "@/lib/inviteTokens";
import { useMeetings } from "@/context/MeetingContext";
import type { Meeting } from "@/data";

const guestRoles = [
  "ผู้ทรงคุณวุฒิภายนอก",
  "ผู้สังเกตการณ์",
  "ผู้แทนหน่วยงานภายนอก",
  "ที่ปรึกษาโครงการ",
] as const;

type PageState =
  | { kind: "loading" }
  | { kind: "valid"; invite: InviteToken; meeting: Meeting }
  | { kind: "error"; reason: "not_found" | "expired" | "already_used" | "meeting_not_found" };

export default function JoinByTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { meetings, joinMeetingAsExternal } = useMeetings();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [guestName, setGuestName] = useState("");
  const [guestRole, setGuestRole] = useState<string>(guestRoles[0]);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (meetings.length === 0) return;

    const result = verifyToken(token);
    if (!result.ok) {
      setState({ kind: "error", reason: result.reason });
      return;
    }

    const meeting = meetings.find((m) => m.id === result.invite.meetingId);
    if (!meeting) {
      setState({ kind: "error", reason: "meeting_not_found" });
      return;
    }

    setState({ kind: "valid", invite: result.invite, meeting });
    if (result.invite.guestName) setGuestName(result.invite.guestName);
  }, [token, meetings]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (state.kind !== "valid") return;
    if (!guestName.trim()) {
      toast.error("กรุณาระบุชื่อของคุณ");
      return;
    }

    setJoining(true);
    markTokenUsed(token);
    joinMeetingAsExternal(state.meeting.id, guestName.trim(), guestRole);
    toast.success("เข้าร่วมประชุมสำเร็จ!", { description: state.meeting.name });

    setTimeout(() => {
      router.push(`/live/${state.meeting.id}`);
    }, 800);
  };

  const errorMessages: Record<string, { icon: string; title: string; desc: string }> = {
    not_found: {
      icon: "link_off",
      title: "ลิงก์ไม่ถูกต้อง",
      desc: "ลิงก์เชิญนี้ไม่มีในระบบ กรุณาขอลิงก์ใหม่จากผู้จัดประชุม",
    },
    expired: {
      icon: "schedule",
      title: "ลิงก์หมดอายุ",
      desc: "ลิงก์เชิญนี้หมดอายุแล้ว กรุณาขอลิงก์ใหม่จากผู้จัดประชุม",
    },
    already_used: {
      icon: "check_circle",
      title: "ลิงก์ถูกใช้ไปแล้ว",
      desc: "ลิงก์นี้ถูกใช้เข้าร่วมประชุมแล้ว หากต้องการเข้าอีกครั้ง กรุณาขอลิงก์ใหม่",
    },
    meeting_not_found: {
      icon: "event_busy",
      title: "ไม่พบการประชุม",
      desc: "การประชุมที่เชิญอาจถูกยกเลิกหรือลบไปแล้ว",
    },
  };

  // Loading
  if (state.kind === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-[32px] text-primary animate-spin">progress_activity</span>
          <p className="text-sm text-muted-foreground">กำลังตรวจสอบลิงก์เชิญ...</p>
        </div>
      </div>
    );
  }

  // Error
  if (state.kind === "error") {
    const err = errorMessages[state.reason];
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Card className="w-full max-w-md">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[30px] text-destructive">{err.icon}</span>
              </div>
              <CardTitle className="text-lg">{err.title}</CardTitle>
              <CardDescription>{err.desc}</CardDescription>
            </CardHeader>
            <CardContent className="text-center pt-2">
              <Button variant="outline" onClick={() => router.push("/")} className="w-full">
                <span className="material-symbols-outlined text-[18px] mr-1.5">home</span>
                กลับหน้าหลัก
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Valid — show join form
  const { meeting, invite } = state;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[36px] text-primary">link</span>
          </div>
          <h1 className="text-xl font-bold">คุณได้รับเชิญเข้าร่วมประชุม</h1>
          <p className="text-sm text-muted-foreground mt-1">ผ่าน Magic Link — ไม่ต้องสร้างบัญชี</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[22px] text-primary">event</span>
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base leading-snug">{meeting.name}</CardTitle>
                <CardDescription className="mt-1 space-y-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                    {meeting.date}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">schedule</span>
                    {meeting.time}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">place</span>
                    {meeting.location}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">person</span>
                    ผู้จัด: {meeting.organizer}
                  </span>
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {invite.guestEmail && (
              <div className="mb-4 rounded-lg bg-muted/50 border px-3 py-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-muted-foreground">mail</span>
                <span className="text-xs text-muted-foreground">ส่งถึง:</span>
                <span className="text-sm font-medium">{invite.guestEmail}</span>
              </div>
            )}

            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">ชื่อ-นามสกุล ของท่าน</label>
                <Input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="เช่น นาย สมศักดิ์ รักดี"
                  className="h-11"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">บทบาท / หน่วยงาน</label>
                <Select value={guestRole} onValueChange={setGuestRole}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {guestRoles.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2 space-y-2">
                <Button type="submit" disabled={joining} className="w-full h-11 text-base font-semibold">
                  {joining ? (
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                      กำลังเข้าร่วม...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">video_call</span>
                      เข้าร่วมประชุม
                    </span>
                  )}
                </Button>
              </div>
            </form>

            <div className="mt-4 pt-4 border-t">
              <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <span className="material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0">shield</span>
                <p>
                  ลิงก์นี้ใช้ได้ครั้งเดียว หมดอายุภายใน 48 ชั่วโมง
                  การเข้าร่วมจะถูกบันทึกเพื่อความปลอดภัย
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-xs text-muted-foreground/60">
          © 2569 e-Meeting · ระบบบริหารการประชุมและจองห้องประชุม
        </div>
      </motion.div>
    </div>
  );
}
