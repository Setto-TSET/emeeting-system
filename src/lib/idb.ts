// ═══════════════════════════════════════════
// IndexedDB — ตัวช่วยกลางสำหรับทุก store ที่ต้องเก็บข้อมูลลง IndexedDB ของเบราว์เซอร์
//
// เดิม src/services/voting/store.ts และ src/services/transcript/store.ts ต่างคนต่าง
// เปิด connection + wrap transaction เป็น Promise เองแยกกัน (โค้ดซ้ำ) แถมเปิด connection
// ใหม่ทุกครั้งที่เรียกฟังก์ชัน (ไม่ cache) — รวมมาไว้ที่นี่จุดเดียว
// ═══════════════════════════════════════════

const dbCache = new Map<string, Promise<IDBDatabase>>();

/** เปิด (หรือคืน connection ที่เปิดค้างไว้แล้ว) ต่อชื่อ DB หนึ่งชื่อ — ไม่เปิดซ้ำทุกครั้งที่เรียก */
export function openIdbDatabase(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void
): Promise<IDBDatabase> {
  const cached = dbCache.get(name);
  if (cached) return cached;

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbCache.delete(name); // connection เปิดไม่สำเร็จ — อย่า cache ไว้ถาวร ให้ลองใหม่ครั้งหน้าได้
      reject(req.error);
    };
  });
  dbCache.set(name, promise);
  return promise;
}

/**
 * รัน transaction หนึ่งรอบแล้ว resolve เมื่อ commit สำเร็จ (tx.oncomplete)
 * run() คืน IDBRequest ตัวสุดท้ายที่อยากอ่านผลลัพธ์ (get/getAll/...) หรือไม่คืนอะไรเลยถ้าเป็นแค่เขียน (put/add)
 */
export function idbRun<T>(
  db: IDBDatabase,
  storeNames: string | string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => IDBRequest<T> | void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const req = run(tx);
    tx.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
    tx.onerror = () => reject(tx.error);
  });
}
