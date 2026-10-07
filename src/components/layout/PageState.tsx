"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// สถานะกลางของหน้าที่ดึงข้อมูลจาก server — ใช้ซ้ำทุกหน้า เพื่อไม่ให้ "กำลังโหลด" กับ "โหลดไม่สำเร็จ"
// ไปแสดงเป็น "ไม่พบข้อมูล" หรือ "ยังไม่มีรายการ" ซึ่งทำให้ผู้ใช้เข้าใจผิดว่าข้อมูลหายไป

export function PageLoading({ label = "กำลังโหลดข้อมูล...", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn("flex min-h-[40dvh] flex-col items-center justify-center gap-2 text-muted-foreground", className)}>
      <span className="material-symbols-outlined animate-spin text-3xl text-primary motion-reduce:animate-none">progress_activity</span>
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function PageError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex min-h-[40dvh] flex-col items-center justify-center gap-3 px-4 text-center", className)}>
      <span className="material-symbols-outlined text-5xl text-destructive">cloud_off</span>
      <div>
        <p className="text-sm font-medium">โหลดข้อมูลไม่สำเร็จ</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <span className="material-symbols-outlined text-base mr-1">refresh</span>
          ลองใหม่
        </Button>
      )}
    </div>
  );
}

/** แถบเล็กสำหรับวางในการ์ด/รายการ — ใช้แทน PageError เมื่อไม่ควรยึดทั้งหน้า */
export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <span className="min-w-0">{message}</span>
      {onRetry && (
        <Button variant="ghost" size="xs" onClick={onRetry} className="text-destructive">
          ลองใหม่
        </Button>
      )}
    </div>
  );
}
