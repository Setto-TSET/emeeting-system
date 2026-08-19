// ═══════════════════════════════════════════
// ศูนย์กระจายสัญญาณในห้องประชุม (ยกมือ / โหวต / ซับไตเติล / แชร์เอกสาร)
//
// เก็บผู้ฟังไว้ในหน่วยความจำของโปรเซส แล้วส่งต่อให้ทุกคนที่เปิดห้องเดียวกันค้างไว้
//
// ponytail: ใช้ได้เมื่อรันเป็นโปรเซสเดียว (dev, VPS, container เดียว) ถ้าวันไหน
// scale เป็นหลายอินสแตนซ์หรือย้ายไป serverless ที่ไม่มี state ค้าง ให้เปลี่ยน
// publish/subscribe ตรงนี้เป็น Redis pub/sub หรือ Postgres LISTEN/NOTIFY
// โดยที่ route กับฝั่ง client ไม่ต้องแก้
// ═══════════════════════════════════════════

type Send = (data: string) => void;

const rooms = new Map<string, Set<Send>>();

export function subscribe(meetingId: string, send: Send): () => void {
  let room = rooms.get(meetingId);
  if (!room) {
    room = new Set();
    rooms.set(meetingId, room);
  }
  room.add(send);

  return () => {
    room.delete(send);
    if (room.size === 0) rooms.delete(meetingId); // ห้องว่างแล้วอย่าถือ Set เปล่าไว้
  };
}

export function publish(meetingId: string, payload: unknown): void {
  const room = rooms.get(meetingId);
  if (!room) return;
  const data = JSON.stringify(payload);
  for (const send of room) {
    try {
      send(data);
    } catch {
      // ผู้ฟังคนนี้หลุดไปแล้ว — ตัวมันเองจะถูกถอดออกตอน stream ถูก cancel
    }
  }
}

/** จำนวนผู้ฟังที่ค้างอยู่ในห้อง — ใช้ตอนตรวจว่ามีคนต่ออยู่จริงไหม */
export function listenerCount(meetingId: string): number {
  return rooms.get(meetingId)?.size ?? 0;
}
