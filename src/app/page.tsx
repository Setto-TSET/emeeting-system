"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    toast.loading("กำลังตรวจสอบข้อมูล...", { id: "login" });
    setTimeout(() => {
      toast.success("เข้าสู่ระบบสำเร็จ", { id: "login" });
      router.push("/dashboard");
    }, 1200);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Left Panel */}
      <div className="hidden md:flex md:w-1/2 lg:w-[55%] relative flex-col justify-end p-12 text-white overflow-hidden">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/login_bg.png')" }}
        />
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#3a3a15]/90 via-[#4e4e1b]/40 to-transparent" />

        <div className="relative z-20 max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            <div className="w-20 h-20 rounded-xl bg-white/10 backdrop-blur-md p-4 mb-6 border border-white/20 shadow-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white" style={{ fontSize: 44 }}>event_note</span>
            </div>
            <h1 className="text-4xl font-bold mb-4 leading-tight">
              ระบบบริหารการประชุม<br />และจองห้องประชุม
            </h1>
            <p className="text-lg text-white/85 font-medium">
              e-Meeting &amp; Room Booking Portal<br />
              บริหารจัดการวาระ องค์ประชุม และรายงานการประชุมแบบครบวงจร
            </p>
            <div className="mt-8 flex items-center gap-6 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">event_available</span>
                จองห้องออนไลน์
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">groups</span>
                จัดการองค์ประชุม
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">verified</span>
                รับรองการประชุม
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 transform translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/5 rounded-full blur-3xl -z-10 transform -translate-x-1/2 translate-y-1/2" />

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          <div className="md:hidden flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-primary rounded-2xl shadow-sm p-4 mb-4 flex items-center justify-center">
              <span className="material-symbols-outlined text-white" style={{ fontSize: 44 }}>event_note</span>
            </div>
            <h1 className="text-xl font-bold text-center text-primary">e-Meeting</h1>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">ยินดีต้อนรับกลับมา</h2>
            <p className="text-sm text-muted-foreground">เข้าสู่ระบบเพื่อจองห้องประชุมและบริหารการประชุม</p>
          </div>

          <form className="space-y-5" onSubmit={handleLogin}>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700" htmlFor="email">
                  Username / อีเมล
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground">
                    <span className="material-symbols-outlined text-[20px]">mail</span>
                  </span>
                  <Input
                    id="email"
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@e-office.cloud"
                    className="pl-10 h-11 bg-muted/30 focus-visible:bg-transparent transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-gray-700" htmlFor="password">
                    รหัสผ่าน (Password)
                  </label>
                  <a href="#" onClick={(e) => { e.preventDefault(); toast.info("กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน"); }} className="text-xs font-semibold text-primary hover:underline">
                    ลืมรหัสผ่าน?
                  </a>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground">
                    <span className="material-symbols-outlined text-[20px]">lock</span>
                  </span>
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 pr-10 h-11 bg-muted/30 focus-visible:bg-transparent transition-colors"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors">
                    <span className="material-symbols-outlined text-[20px]">
                      {showPassword ? "visibility" : "visibility_off"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="remember"
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <label htmlFor="remember" className="text-sm font-medium leading-none text-gray-600 cursor-pointer">
                  จดจำฉันไว้ในระบบ
                </label>
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

          <div className="mt-12 pt-6 border-t border-border flex items-center justify-center gap-4 text-xs text-muted-foreground/60">
            <span>© 2569 e-Office</span>
            <span>•</span>
            <a href="#" className="hover:text-primary transition-colors">นโยบายความเป็นส่วนตัว</a>
            <span>•</span>
            <a href="#" className="hover:text-primary transition-colors">ติดต่อเรา</a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
