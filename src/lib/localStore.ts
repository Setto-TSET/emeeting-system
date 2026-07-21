// ═══════════════════════════════════════════
// localStore — ตัวช่วยอ่าน/เขียน localStorage แบบที่ React subscribe ได้
//
// ใช้ useSyncExternalStore ซึ่งเป็นเครื่องมือมาตรฐานสำหรับ "ข้อมูลที่อยู่นอก React"
// ได้ประโยชน์ 3 อย่างเทียบกับการโหลดใน useEffect:
//   1. ไม่มีปัญหา hydration mismatch (getServerSnapshot คืนค่าเริ่มต้นเสมอ)
//   2. sync ข้ามแท็บได้ฟรี
//   3. ไม่ต้อง setState ใน effect (ซึ่ง React เตือนว่าทำให้ render ซ้อน)
//
// วันที่ต่อ backend: เปลี่ยน readRaw/writeRaw ให้ยิง API แทน โครง subscribe ยังเหมือนเดิม
// ═══════════════════════════════════════════

type Listener = () => void;

/** cache กัน getSnapshot คืน object ใหม่ทุกครั้ง ซึ่งจะทำให้ React re-render ไม่รู้จบ */
const snapshotCache = new Map<string, { raw: string | null; parsed: unknown }>();
const listeners = new Map<string, Set<Listener>>();

function notify(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

export function subscribeToKey(key: string, listener: Listener): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(listener);

  // sync ข้ามแท็บ — event นี้ยิงเฉพาะแท็บอื่น ไม่ยิงแท็บที่เขียนเอง
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.get(key)?.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** อ่านค่าปัจจุบัน — คืน reference เดิมถ้าข้อมูลดิบไม่เปลี่ยน */
export function readKey<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }

  const cached = snapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.parsed as T;

  let parsed: T = fallback;
  if (raw !== null) {
    try {
      parsed = JSON.parse(raw) as T;
    } catch (e) {
      console.error(`Failed to parse localStorage key "${key}"`, e);
    }
  }
  snapshotCache.set(key, { raw, parsed });
  return parsed;
}

export function writeKey<T>(key: string, value: T): void {
  try {
    const raw = JSON.stringify(value);
    localStorage.setItem(key, raw);
    snapshotCache.set(key, { raw, parsed: value });
  } catch (e) {
    console.error(`Failed to write localStorage key "${key}"`, e);
  }
  notify(key);
}

/** เขียนค่าเริ่มต้นถ้ายังไม่มีข้อมูลในเครื่อง */
export function seedKey<T>(key: string, seed: T): void {
  try {
    if (localStorage.getItem(key) === null) writeKey(key, seed);
  } catch {
    /* โหมดส่วนตัวบางเบราว์เซอร์เขียนไม่ได้ — ปล่อยให้ใช้ค่าเริ่มต้นในหน่วยความจำ */
  }
}
