// ═══════════════════════════════════════════
// ASR Provider — สัญญาเดียวที่ audio.ts รู้จัก
//
// เปลี่ยนผู้ให้บริการถอดเสียงให้เพิ่มไฟล์ใหม่ในโฟลเดอร์นี้ ไม่ต้องแตะ audio.ts
// ═══════════════════════════════════════════

export type AsrOpenOptions = {
  /** ผลระหว่างพูด — ยิงได้หลายครั้งต่อประโยค ห้ามเขียนลงฐานข้อมูล */
  onPartial(text: string): void;
  /** ผลสุดท้ายของประโยค — เขียนลง transcript ได้ */
  onFinal(text: string, startSec: number): void;
  /** ศัพท์เฉพาะของการประชุมนี้ (ชื่อคน ชื่อคณะ วาระ) provider ที่ไม่รองรับให้เมิน */
  phrases?: string[];
};

export type AsrSession = {
  /** ป้อนเสียงเฟรมถัดไป — ไม่คืนผล ผลมาทาง callback */
  push(pcm: Buffer, startSec: number): void;
  /** ปิด session และรอผลสุดท้ายที่ค้างอยู่ให้ยิงครบก่อน */
  close(): Promise<void>;
};

export type AsrProvider = {
  /** ชื่อสำหรับ log — ต้องบอกได้ว่าเสียงห้องนี้วิ่งไปทางไหน */
  readonly name: 'azure' | 'typhoon';
  open(options: AsrOpenOptions): Promise<AsrSession>;
};
