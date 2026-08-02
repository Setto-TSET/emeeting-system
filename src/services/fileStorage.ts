// ═══════════════════════════════════════════
// File Storage — เก็บไฟล์จริงในเบราว์เซอร์ (ระหว่างที่ยังไม่มี backend)
//
// ทำไมใช้ IndexedDB ไม่ใช่ localStorage:
//   - File/Blob แปลงเป็น JSON ไม่ได้
//   - base64 บวมขึ้น ~33% และช้ามาก
//   - localStorage เพดาน ~5 MB → PDF ไฟล์ที่สองก็เต็ม
//   - IndexedDB รับ Blob โดยตรงและมีเพดานเป็น GB
//
// ⚠️ ยังไม่ใช่ระบบจัดเก็บระดับ production
//   - ข้อมูลอยู่ในเครื่องผู้ใช้เท่านั้น เปิดจากเครื่องอื่นไม่เห็น
//   - ใครมีสิทธิ์เข้าเครื่องนี้ก็เปิด DevTools ดูได้
//   - วันมี backend เปลี่ยน implementation เป็น S3/blob store ใน API เดียวกัน
// ═══════════════════════════════════════════

const DB_NAME = "emeeting_files";
const STORE = "blobs";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type StoredFileMeta = {
  storageKey: string;
  sizeBytes: number;
  mimeType: string;
};

/** เก็บไฟล์ลง IndexedDB คืนกุญแจสำหรับเปิดกลับมา */
export async function putFile(file: File): Promise<StoredFileMeta> {
  const storageKey = `file-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(file, storageKey);
    tx.oncomplete = () =>
      resolve({ storageKey, sizeBytes: file.size, mimeType: file.type || "application/octet-stream" });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** เปิดไฟล์กลับมาเป็น Blob — null ถ้าไม่พบ (เช่น เปิดจากคนละเครื่อง) */
export async function getFileBlob(storageKey: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(storageKey);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** สร้าง object URL สำหรับใช้กับ <iframe>/<img> — คนเรียกต้อง revokeObjectURL เอง */
export async function getFileObjectUrl(storageKey: string): Promise<string | null> {
  const blob = await getFileBlob(storageKey);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function removeFile(storageKey: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(storageKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** อ่านง่ายๆ: 1234567 → "1.2 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
