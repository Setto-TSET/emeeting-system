"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/services/api/client";
import { acknowledgeConfidentiality } from "@/services/api/meetings";
import { WATERMARK_ORG } from "./DocumentPreview";

/**
 * ข้อตกลงรักษาความลับก่อนเข้าห้องประชุม — ทุกคนรวมแขกต้องติ๊กยอมรับ
 * บันทึกที่ server ก่อนแล้วจึงเข้าห้อง เป็นหลักฐานว่าใครรับทราบเมื่อไร
 */
export function ConfidentialityGate({
  meetingId,
  meetingName,
  onAccepted,
  onCancel,
}: {
  meetingId: string;
  meetingName: string;
  onAccepted: () => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await acknowledgeConfidentiality(meetingId);
      onAccepted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "บันทึกการยอมรับไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-warning/10 border border-warning/40 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-3xl text-warning">shield_lock</span>
          </div>
          <CardTitle className="text-lg font-semibold">ข้อตกลงการรักษาความลับ</CardTitle>
          <CardDescription>{meetingName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm space-y-2">
            <p>
              การประชุมนี้มีเอกสารและข้อมูลที่เป็นความลับของ{WATERMARK_ORG} <strong>ห้ามเผยแพร่</strong> ห้ามบันทึกภาพ
              บันทึกหน้าจอ บันทึกเสียง คัดลอก หรือส่งต่อแก่บุคคลอื่นโดยไม่ได้รับอนุญาต
            </p>
            <p>
              ผู้ใดนำเอกสารหรือข้อมูลจากการประชุมนี้ไปเผยแพร่ อาจถูกดำเนินการทางวินัยและ/หรือทางกฎหมาย
            </p>
            <p className="text-caption text-muted-foreground">
              เอกสารทุกหน้ามีลายน้ำระบุชื่อผู้เปิดดูและเวลา และระบบบันทึกการยอมรับข้อตกลงนี้ไว้เป็นหลักฐาน
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
            />
            <span>ข้าพเจ้ารับทราบและยินยอมรักษาความลับของเอกสารและข้อมูลในการประชุมนี้</span>
          </label>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              ยกเลิก
            </Button>
            <Button onClick={() => void accept()} disabled={!checked || busy}>
              <span className="material-symbols-outlined text-lg mr-1.5">login</span>
              {busy ? "กำลังบันทึก..." : "เข้าร่วมประชุม"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
