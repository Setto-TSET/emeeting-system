"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/context/UserContext";
import { canAccessRoute, getHomeRoute } from "@/lib/access";
import { getAccessToken } from "@/services/api/client";

/**
 * กันผู้เข้าร่วมพิมพ์ URL ตรงเข้าหน้าที่ไม่มีสิทธิ์ (เช่น /booking, /meetings)
 * ซ่อนเมนูอย่างเดียวไม่พอ — เมนูหายแต่ route ยังเปิดอยู่
 *
 * หมายเหตุ: นี่เป็น guard ฝั่ง client สำหรับ prototype
 * ระบบจริงต้องเช็คสิทธิ์ที่ server/API ด้วย ไม่งั้นยัง bypass ได้
 */
export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, signOut } = useCurrentUser();
  // null = ยังไม่ได้เช็ค (token อยู่ใน sessionStorage อ่านได้หลัง mount เท่านั้น)
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  // ตัวตนก๊อปมาจาก localStorage ได้ แต่ JWT อยู่ใน sessionStorage ต่อแท็บ —
  // แท็บใหม่จึงเห็นชื่อผู้ใช้ทั้งที่ไม่มี token แล้วทุกการบันทึกได้ "Missing authorization header"
  // ไม่มี token = ถือว่ายังไม่ login: ล้างตัวตนค้างแล้วส่งกลับหน้า login
  useEffect(() => {
    const ok = !!getAccessToken();
    setHasToken(ok);
    if (!ok) {
      signOut();
      router.replace("/");
    }
  }, [signOut, router]);

  const allowed = canAccessRoute(currentUser.systemRole, pathname);

  useEffect(() => {
    if (hasToken && !allowed) {
      router.replace(getHomeRoute(currentUser.systemRole));
    }
  }, [hasToken, allowed, currentUser.systemRole, router]);

  if (!hasToken) return null;

  if (!allowed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
        <span className="material-symbols-outlined text-[44px] text-muted-foreground mb-2">lock</span>
        <p className="text-sm font-medium">หน้านี้สงวนสำหรับผู้จัดการประชุม</p>
        <p className="text-xs text-muted-foreground mt-1">กำลังพากลับไปหน้าหลัก...</p>
      </div>
    );
  }

  return <>{children}</>;
}
