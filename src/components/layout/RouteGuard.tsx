"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/context/UserContext";
import { canAccessRoute, HOME_ROUTE } from "@/lib/access";

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
  const { currentUser } = useCurrentUser();

  const allowed = canAccessRoute(currentUser.systemRole, pathname);

  useEffect(() => {
    if (!allowed) {
      router.replace(HOME_ROUTE);
    }
  }, [allowed, currentUser.systemRole, router]);

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
