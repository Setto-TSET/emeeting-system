"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════
// ComingSoon — วิธีมาตรฐานเดียวของทั้งแอปสำหรับ "ฟีเจอร์ที่ยังไม่เปิดใช้งาน"
//
// ทำไมต้องมี: เดิมมีปุ่มหลายตัวที่กดแล้วขึ้น toast ว่าสำเร็จ ทั้งที่ไม่ได้ทำอะไรเลย
// ซึ่งแย่กว่าปุ่มที่กดไม่ได้ เพราะผู้ใช้เข้าใจผิดว่างานถูกบันทึกแล้ว
//
// กฎ: ฟีเจอร์ที่ยังทำไม่เสร็จต้อง "กดไม่ได้ + บอกเหตุผล" ไม่ใช่ "กดได้แต่ไม่เกิดอะไร"
// ═══════════════════════════════════════════

type ComingSoonProps = {
  children: ReactNode;
  /** เหตุผล/กำหนดการ เช่น "รอเชื่อมต่อระบบอีเมล" */
  reason?: string;
  className?: string;
};

/**
 * ครอบปุ่มหรือกลุ่มปุ่มที่ยังไม่เปิดใช้งาน
 *
 * ต้องครอบด้วย <span> เพราะปุ่มที่ disabled ไม่ยิง mouse event
 * ทำให้ title บนตัวปุ่มเองไม่แสดง tooltip ในหลายเบราว์เซอร์
 */
export function ComingSoon({ children, reason, className }: ComingSoonProps) {
  const label = reason ? `ยังไม่เปิดใช้งาน — ${reason}` : "ยังไม่เปิดใช้งาน";

  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-flex cursor-not-allowed opacity-50 [&>*]:pointer-events-none", className)}
    >
      {children}
    </span>
  );
}

/** ป้ายกำกับสำหรับส่วนที่ยังไม่เปิดใช้งาน ใช้คู่กับหัวข้อในกล่อง dialog */
export function ComingSoonBadge({ reason }: { reason?: string }) {
  return (
    <span
      title={reason}
      className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
    >
      <span className="material-symbols-outlined text-[12px]">schedule</span>
      ยังไม่เปิดใช้งาน
    </span>
  );
}
