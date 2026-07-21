"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ResolvedConference } from "@/lib/conference";

// ═══════════════════════════════════════════
// หน้าจอสำหรับการประชุมที่วิ่งบนแพลตฟอร์มภายนอก (Teams / Zoom / Google Meet)
//
// Teams, Zoom และ Google Meet บล็อกการฝัง iframe (X-Frame-Options / CSP)
// เราจึงพาผู้ใช้ไปเปิดแอปของเจ้านั้นแทน — ส่วนวาระและเอกสารยังอยู่ในเว็บเราเหมือนเดิม
// ═══════════════════════════════════════════

type Props = {
  conference: ResolvedConference;
  meetingName: string;
};

export function ExternalConferenceStage({ conference, meetingName }: Props) {
  const { spec, url, meetingId, passcode } = conference;
  const [opened, setOpened] = useState(false);

  const handleJoin = () => {
    if (!url) {
      toast.error("ผู้จัดยังไม่ได้ระบุลิงก์ประชุม");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setOpened(true);
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`คัดลอก${label}แล้ว`))
      .catch(() => toast.error("คัดลอกไม่สำเร็จ"));
  };

  return (
    <div className="flex-1 min-h-[300px] rounded-2xl border border-border bg-card flex flex-col items-center justify-center p-6 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center mb-4">
        <span className="material-symbols-outlined text-[34px] text-foreground">{spec.icon}</span>
      </div>

      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        การประชุมนี้จัดผ่าน
      </p>
      <h2 className="text-xl font-bold text-foreground mt-1">{spec.label}</h2>
      <p className="text-xs text-muted-foreground mt-2 max-w-sm">{meetingName}</p>

      {/* รหัสห้อง — เผื่อแอปไม่เปิดเอง ผู้ใช้กรอกเองได้ */}
      {(meetingId || passcode) && (
        <div className="mt-5 w-full max-w-xs space-y-2">
          {meetingId && (
            <div className="flex items-center justify-between gap-2 bg-muted border border-border rounded-xl px-3 py-2">
              <div className="text-left min-w-0">
                <p className="text-[10px] text-muted-foreground">รหัสห้องประชุม</p>
                <p className="text-sm font-mono font-bold text-foreground truncate">{meetingId}</p>
              </div>
              <Button
                onClick={() => copy(meetingId, "รหัสห้อง")}
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                title="คัดลอกรหัสห้อง"
              >
                <span className="material-symbols-outlined text-[16px]">content_copy</span>
              </Button>
            </div>
          )}
          {passcode && (
            <div className="flex items-center justify-between gap-2 bg-muted border border-border rounded-xl px-3 py-2">
              <div className="text-left min-w-0">
                <p className="text-[10px] text-muted-foreground">รหัสผ่าน</p>
                <p className="text-sm font-mono font-bold text-foreground truncate">{passcode}</p>
              </div>
              <Button
                onClick={() => copy(passcode, "รหัสผ่าน")}
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                title="คัดลอกรหัสผ่าน"
              >
                <span className="material-symbols-outlined text-[16px]">content_copy</span>
              </Button>
            </div>
          )}
        </div>
      )}

      <Button
        onClick={handleJoin}
        disabled={!url}
        className={`mt-6 h-12 px-8 text-white font-bold shadow-lg ${spec.brandClass}`}
      >
        <span className="material-symbols-outlined text-[20px] mr-2">open_in_new</span>
        เปิด {spec.shortLabel} เพื่อเข้าประชุม
      </Button>

      <p className="text-[11px] text-muted-foreground mt-3 max-w-sm">
        {url ? spec.joinHint : "ผู้จัดยังไม่ได้ระบุลิงก์ประชุม กรุณาติดต่อเลขานุการ"}
      </p>

      {opened && (
        <div className="mt-5 flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5">
          <span className="material-symbols-outlined text-[14px]">check_circle</span>
          เปิด {spec.shortLabel} ในแท็บใหม่แล้ว — วาระและเอกสารยังดูได้จากหน้านี้
        </div>
      )}

      <div className="mt-6 pt-5 border-t border-border w-full max-w-sm">
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 text-left">
          <span className="material-symbols-outlined text-[14px] shrink-0 mt-px">info</span>
          <span>
            ภาพและเสียงอยู่ใน {spec.shortLabel} ส่วนระเบียบวาระและเอกสารประกอบการประชุม
            ให้ดูจากแผงด้านขวาของหน้านี้ได้ตลอดการประชุม
          </span>
        </p>
      </div>
    </div>
  );
}
