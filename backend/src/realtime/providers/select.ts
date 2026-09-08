// ═══════════════════════════════════════════
// เลือกเส้นทางถอดเสียงจากระดับความลับของการประชุม
//
// ตัดสินที่ server เท่านั้น เฟรมจาก client ไม่มีที่ให้บอกว่าจะใช้ provider ไหน —
// ถ้าให้ client เลือกได้ คนที่แก้ payload เองก็ส่งเสียงประชุมลับออก cloud ได้
// ═══════════════════════════════════════════

import type { MeetingPayload } from '../../repositories/meetings';
import { azureProvider, isAzureConfigured } from './azure';
import { typhoonProvider } from './typhoon';
import type { AsrProvider } from './types';

// ระดับที่ยอมให้เสียงออกไปประมวลผลนอกองค์กร — นอกจากสองค่านี้ไปทาง self-host ทั้งหมด
const CLOUD_LEVELS = new Set(['normal', 'restricted']);

export function selectProvider(meeting: MeetingPayload | null): AsrProvider {
  // อ่านการประชุมไม่ได้แปลว่าไม่รู้ว่าห้องนี้ลับแค่ไหน ค่าตั้งต้นต้องเป็นทางที่ปลอดภัยกว่าเสมอ
  if (!meeting) return typhoonProvider;

  const level = typeof meeting.confidentialityLevel === 'string' ? meeting.confidentialityLevel : 'normal';
  if (!CLOUD_LEVELS.has(level)) return typhoonProvider;

  // ไม่มีคีย์ก็ไปทาง typhoon ตามปกติ ไม่ใช่การ fallback อัตโนมัติจาก Azure ที่ล้ม —
  // ตรงนี้คือ "ยังไม่ได้ตั้งค่า" ซึ่งต่างจาก "ตั้งแล้วแต่พัง" (ดู audio.ts)
  return isAzureConfigured() ? azureProvider : typhoonProvider;
}
