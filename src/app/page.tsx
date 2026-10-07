"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/session";
import { getHomeRoute } from "@/lib/access";
import { useCurrentUser } from "@/context/UserContext";

// บัญชีสำหรับทดสอบอยู่ใน docs/test-accounts.md — หน้า login ของระบบจริงไม่เปิดเผยรายชื่อผู้ใช้

// useSearchParams ต้องอยู่ใต้ Suspense — ส่วนอื่นของหน้ายัง prerender ได้ตามปกติ
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

const NOTICES: Record<string, string> = {
  expired: "เซสชันหมดอายุ — กรุณาเข้าสู่ระบบอีกครั้ง",
  left: "ออกจากห้องประชุมแล้ว ขอบคุณที่เข้าร่วม",
};

function LoginForm() {
  const router = useRouter();
  const { setCurrentUser } = useCurrentUser();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // apiFetch พามาที่นี่พร้อม ?reason=... เมื่อเซสชันหมดอายุ หรือแขกออกจากห้องประชุม
  const notice = NOTICES[useSearchParams().get("reason") ?? ""] ?? null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    toast.loading("กำลังตรวจสอบข้อมูล...", { id: "login" });

    const result = await signIn(email, password);

    if (!result.ok) {
      toast.error(result.reason, { id: "login" });
      setIsSubmitting(false);
      return;
    }

    setCurrentUser(result.user);
    toast.success(`เข้าสู่ระบบสำเร็จ — ${result.user.name}`, { id: "login" });
    // บัญชีห้องประชุมไปหน้า kiosk ตรง ๆ ไม่ต้องผ่าน dashboard ที่ตัวเองเข้าไม่ได้
    router.push(getHomeRoute(result.user.systemRole));
  };

  return (
    <div className="min-h-dvh flex flex-col md:flex-row bg-background">
      {/* Left Panel */}
      <div className="hidden md:flex md:w-1/2 lg:w-[55%] relative flex-col justify-end p-12 text-primary-foreground overflow-hidden">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/login_bg.png')" }}
        />
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-primary/95 via-primary/40 to-transparent" />

        <div className="relative z-20 max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            <div className="w-24 h-24 rounded-full bg-card p-2 mb-6 shadow-lg flex items-center justify-center">
              <Image src="/logo.png" alt="ตราสภาเภสัชกรรม" width={56} height={104} className="h-20 w-auto" priority />
            </div>
            <h1 className="text-4xl font-bold mb-4 leading-tight text-balance">
              ระบบบริหารการประชุม<br />และจองห้องประชุม
            </h1>
            <p className="text-lg text-primary-foreground/85 font-medium">
              จองห้อง จัดวาระ ประชุมออนไลน์ และจัดทำรายงานการประชุมของสภาเภสัชกรรมในที่เดียว
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-primary-foreground/70">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">event_available</span>
                จองห้องออนไลน์
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">groups</span>
                จัดการองค์ประชุม
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">verified</span>
                รับรองการประชุม
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Panel — overflow-hidden กันวงแสงตกแต่งล้นจอจนเลื่อนแนวนอนได้บนมือถือ */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 transform translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/5 rounded-full blur-3xl -z-10 transform -translate-x-1/2 translate-y-1/2" />

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          <div className="md:hidden flex flex-col items-center mb-8 text-center">
            <Image src="/logo.png" alt="ตราสภาเภสัชกรรม" width={48} height={89} className="h-20 w-auto mb-4" priority />
            <h1 className="text-xl font-bold text-primary">e-Meeting สภาเภสัชกรรม</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              จองห้อง จัดวาระ ประชุมออนไลน์ และจัดทำรายงานการประชุมในที่เดียว
            </p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">เข้าสู่ระบบ</h2>
            <p className="text-sm text-muted-foreground">ใช้อีเมลและรหัสผ่านที่ได้รับจากผู้ดูแลระบบ</p>
          </div>

          {notice && (
            <p role="status" className="mb-5 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
              {notice}
            </p>
          )}

          <form className="space-y-5" onSubmit={handleLogin}>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground" htmlFor="email">
                  อีเมล
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground">
                    <span className="material-symbols-outlined text-xl">mail</span>
                  </span>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="อีเมลของคุณ"
                    className="pl-10 h-11 bg-muted/30 focus-visible:bg-transparent transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-foreground" htmlFor="password">
                    รหัสผ่าน
                  </label>
                  <button
                    type="button"
                    onClick={() => toast.info("ติดต่อผู้ดูแลระบบของสภาเภสัชกรรมเพื่อขอตั้งรหัสผ่านใหม่")}
                    className="-my-2 px-1 py-2 text-xs font-semibold text-primary hover:underline pointer-coarse:min-h-11"
                  >
                    ลืมรหัสผ่าน?
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground">
                    <span className="material-symbols-outlined text-xl">lock</span>
                  </span>
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 pr-12 h-11 bg-muted/30 focus-visible:bg-transparent transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="material-symbols-outlined text-xl">
                      {showPassword ? "visibility" : "visibility_off"}
                    </span>
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full h-11 text-base font-semibold shadow-md mt-2">
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined animate-spin">progress_activity</span>
                    กำลังเข้าสู่ระบบ...
                  </div>
                ) : (
                  "เข้าสู่ระบบ"
                )}
              </Button>
            </form>

          <div className="mt-12 pt-6 border-t border-border text-center text-xs text-muted-foreground">
            © 2569 สภาเภสัชกรรม · e-Meeting
          </div>
        </motion.div>
      </div>
    </div>
  );
}
