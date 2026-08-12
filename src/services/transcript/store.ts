// src/services/transcript/store.ts
//
// เก็บ transcript คำบรรยาย (subtitle) ที่ finalize แล้วลง IndexedDB ของเบราว์เซอร์ผู้ใช้
//
// ⚠️ ข้อจำกัด (frontend-only demo ไม่มี backend กลาง):
//   แต่ละแท็บ/เครื่องที่เปิดห้องประชุมพร้อมระบบ subtitle จะบันทึก transcript
//   "สำเนาของตัวเอง" ลง IndexedDB ของเครื่องนั้นเท่านั้น — ไม่ได้ sync ไปที่อื่น
//   ดังนั้นหน้าดู transcript จะเห็นเฉพาะส่วนที่แท็บนั้นๆ ได้ยิน/ถูก broadcast มาถึงจริง

export type TranscriptSegment = {
  speakerId: string;
  speakerName: string;
  startSec: number;
  text: string;
};

const DB_NAME = "emeeting_transcript";
const STORE = "segments";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("meetingId", "meetingId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function appendSegment(meetingId: string, segment: TranscriptSegment): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ meetingId, ...segment });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getTranscript(meetingId: string): Promise<TranscriptSegment[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const index = tx.objectStore(STORE).index("meetingId");
    const req = index.getAll(meetingId);
    req.onsuccess = () => resolve(((req.result as (TranscriptSegment & { meetingId: string })[]) ?? []).sort((a, b) => a.startSec - b.startSec));
    req.onerror = () => reject(req.error);
  });
}
