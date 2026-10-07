"use client"; // error boundary ต้องเป็น Client Component

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// กันหน้าขาวทั้งจอเมื่อหน้าใดหน้าหนึ่ง render พัง — ครอบทุก route ใต้ root layout
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <span className="material-symbols-outlined text-5xl text-destructive">error</span>
      <div>
        <h1 className="text-lg font-semibold">หน้านี้เกิดข้อผิดพลาด</h1>
        <p className="mt-1 text-sm text-muted-foreground">ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้กลับหน้าแรกแล้วเข้าใหม่</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>ลองใหม่</Button>
        <Button variant="outline" onClick={() => window.location.assign("/")}>
          กลับหน้าแรก
        </Button>
      </div>
    </div>
  );
}
