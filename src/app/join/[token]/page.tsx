"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { openGuestLink, joinGuestLink, type GuestLinkMeeting, type GuestLinkRejection } from "@/services/api/guestLinks";
import { setAccessToken, ApiError } from "@/services/api/client";
import { useCurrentUser } from "@/context/UserContext";

const guestRoles = [
  "ผู้ทรงคุณวุฒิภายนอก",
  "ผู้สังเกตการณ์",
  "ผู้แทนหน่วยงานภายนอก",
  "ที่ปรึกษาโครงการ",
] as const;

type PageState =
  | { kind: "loading" }
  | { kind: "valid"; meeting: GuestLinkMeeting }
  | { kind: "error"; reason: GuestLinkRejection };

export default function JoinByTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { setCurrentUser } = useCurrentUser();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [guestName, setGuestName] = useState("");
  const [guestRole, setGuestRole] = useState<string>(guestRoles[0]);
  const [joining, setJoining] = useState(false);

  // อ่านจาก endpoint สาธารณะ — แขกยังไม่ล็อกอิน จะพึ่ง useMeetings() ไม่ได้
  useEffect(() => {
    let cancelled = false;

    openGuestLink(token)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setState({ kind: "error", reason: result.reason });
          return;
        }
        setState({ kind: "valid", meeting: result.meeting });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error", reason: "unavailable" });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.kind !== "valid") return;
    if (!guestName.trim()) {
      toast.error("กรุณาระบุชื่อของคุณ");
      return;
    }

    setJoining(true);
    try {
      const result = await joinGuestLink(token, guestName.trim());
      if (!result.ok) {
        setState({ kind: "error", reason: result.reason });
        return;
      }

      // guest JWT ผูกกับการประชุมนี้ห้องเดียว — WebSocket ของห้อง live ตรวจฟิลด์นี้
      setAccessToken(result.token);
      setCurrentUser({
        id: result.user.id,
        name: result.user.name,
        position: guestRole,
        department: "ภายนอกองค์กร",
        email: result.user.email,
        systemRole: "external",
        committeeIds: [],
      });

      toast.success("เข้าร่วมประชุมสำเร็จ!", { description: result.meeting.name });
      router.push(`/live/${result.meeting.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เข้าร่วมประชุมไม่สำเร็จ");
      setJoining(false);
    }
  };

  const errorMessages: Record<GuestLinkRejection, { icon: string; title: string; desc: string }> = {
    not_found: {
      icon: "link_off",
      title: "ลิงก์ไม่ถูกต้องหรือถูกยกเลิกแล้ว",
      desc: "ลิงก์นี้ไม่มีในระบบ หรือผู้จัดสร้างลิงก์ใหม่แทนแล้ว กรุณาขอลิงก์ล่าสุดจากผู้จัดประชุม",
    },
    guest_join_disabled: {
      icon: "block",
      title: "การประชุมนี้ปิดรับบุคคลภายนอกแล้ว",
      desc: "ผู้จัดประชุมปิดการเข้าร่วมของบุคคลภายนอก กรุณาติดต่อผู้จัดประชุม",
    },
    unavailable: {
      icon: "cloud_off",
      title: "ติดต่อระบบไม่ได้ชั่วคราว",
      desc: "ลิงก์ของท่านยังใช้ได้ — ระบบไม่ตอบสนองในขณะนี้ กรุณาลองใหม่อีกครั้งในอีกสักครู่",
    },
  };

  // Loading
  if (state.kind === "loading") {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
          <p className="text-sm text-muted-foreground">กำลังตรวจสอบลิงก์เชิญ...</p>
        </div>
      </div>
    );
  }

  // Error
  if (state.kind === "error") {
    const err = errorMessages[state.reason];
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Card className="w-full max-w-md">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-3xl text-destructive">{err.icon}</span>
              </div>
              <CardTitle className="text-lg">{err.title}</CardTitle>
              <CardDescription>{err.desc}</CardDescription>
            </CardHeader>
            <CardContent className="text-center pt-2 space-y-2">
              {state.reason === "unavailable" && (
                <Button onClick={() => window.location.reload()} className="w-full">
                  <span className="material-symbols-outlined text-lg mr-1.5">refresh</span>
                  ลองใหม่
                </Button>
              )}
              <Button variant="outline" onClick={() => router.push("/")} className="w-full">
                <span className="material-symbols-outlined text-lg mr-1.5">home</span>
                กลับหน้าหลัก
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Valid — show join form
  const { meeting } = state;

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-4xl text-primary">link</span>
          </div>
          <h1 className="text-xl font-bold">คุณได้รับเชิญเข้าร่วมประชุม</h1>
          <p className="text-sm text-muted-foreground mt-1">ใส่ชื่อของท่านแล้วกดเข้าร่วม — ไม่ต้องมีบัญชีในระบบ</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-2xl text-primary">event</span>
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base leading-snug">{meeting.name}</CardTitle>
                <CardDescription className="mt-1 space-y-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">calendar_today</span>
                    {meeting.date}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    {meeting.startTime} - {meeting.endTime} น.
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">place</span>
                    {meeting.location}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">person</span>
                    ผู้จัด: {meeting.organizer}
                  </span>
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>

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
                      <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                      กำลังเข้าร่วม...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">video_call</span>
                      เข้าร่วมประชุม
                    </span>
                  )}
                </Button>
              </div>
            </form>

            <div className="mt-4 pt-4 border-t">
              <div className="flex items-start gap-2 text-caption text-muted-foreground">
                <span className="material-symbols-outlined text-sm mt-0.5 flex-shrink-0">shield</span>
                <p>
                  ลิงก์นี้สำหรับผู้ได้รับเชิญเท่านั้น กรุณาอย่าส่งต่อ — ผู้จัดยกเลิกลิงก์ได้ทุกเมื่อ
                  ชื่อที่ใส่จะแสดงในห้องประชุมและถูกบันทึกเพื่อความปลอดภัย
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
