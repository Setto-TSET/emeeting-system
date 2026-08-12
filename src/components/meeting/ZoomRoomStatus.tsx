// src/components/meeting/ZoomRoomStatus.tsx
import { Badge } from "@/components/ui/badge";
import type { ZoomRoomDevice } from "@/data";

const STATUS_LABEL: Record<ZoomRoomDevice["status"], string> = {
  invited: "รอเชื่อมต่อ",
  connected: "เชื่อมต่อแล้ว",
  disconnected: "ตัดการเชื่อมต่อ",
};

export function ZoomRoomStatus({ devices }: { devices: ZoomRoomDevice[] }) {
  if (devices.length === 0) return null;
  return (
    <div className="space-y-2">
      {devices.map((d) => (
        <div key={d.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
          <span>{d.name}</span>
          <Badge variant={d.status === "connected" ? "default" : "secondary"}>{STATUS_LABEL[d.status]}</Badge>
        </div>
      ))}
      <div className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
        การเชื่อมต่อ Zoom Room กับ ZegoCloud ต้องใช้ Enterprise Plan — ฟีเจอร์นี้อยู่ระหว่างรอแผนองค์กร
      </div>
    </div>
  );
}
