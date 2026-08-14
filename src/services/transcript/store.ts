// src/services/transcript/store.ts
//
// เก็บ transcript คำบรรยาย (subtitle) ที่ finalize แล้วลง IndexedDB ของเบราว์เซอร์ผู้ใช้
//
// ⚠️ ข้อจำกัด (frontend-only demo ไม่มี backend กลาง):
//   แต่ละแท็บ/เครื่องที่เปิดห้องประชุมพร้อมระบบ subtitle จะบันทึก transcript
//   "สำเนาของตัวเอง" ลง IndexedDB ของเครื่องนั้นเท่านั้น — ไม่ได้ sync ไปที่อื่น
//   ดังนั้นหน้าดู transcript จะเห็นเฉพาะส่วนที่แท็บนั้นๆ ได้ยิน/ถูก broadcast มาถึงจริง

import { openIdbDatabase, idbRun } from "@/lib/idb";

export type TranscriptSegment = {
  speakerId: string;
  speakerName: string;
  startSec: number;
  text: string;
};

const DB_NAME = "emeeting_transcript";
const STORE = "segments";
const VERSION = 1;

function db() {
  return openIdbDatabase(DB_NAME, VERSION, (database) => {
    if (!database.objectStoreNames.contains(STORE)) {
      const store = database.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      store.createIndex("meetingId", "meetingId");
    }
  });
}

export async function appendSegment(meetingId: string, segment: TranscriptSegment): Promise<void> {
  await idbRun(await db(), STORE, "readwrite", (tx) => tx.objectStore(STORE).add({ meetingId, ...segment }));
}

export async function getTranscript(meetingId: string): Promise<TranscriptSegment[]> {
  const all = await idbRun<(TranscriptSegment & { meetingId: string })[]>(await db(), STORE, "readonly", (tx) =>
    tx.objectStore(STORE).index("meetingId").getAll(meetingId)
  );
  return (all ?? []).sort((a, b) => a.startSec - b.startSec);
}
