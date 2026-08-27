// ═══════════════════════════════════════════
// สิทธิ์ต่อการประชุมหนึ่งๆ ฝั่ง server — ของจริงที่บังคับใช้
//
// เทียบกับ src/lib/authz.ts ฝั่งหน้าเว็บ: ที่นี่ตัดกฎที่อิง "คณะทำงาน" ออก
// (isSecretaryOfCommittee / isExecutiveOfCommittee) เพราะ JWT และตาราง app_users
// ยังไม่มีข้อมูลคณะที่ผู้ใช้สังกัด — เดาไม่ได้ก็ต้องปฏิเสธ ไม่ใช่ปล่อยผ่าน
//
// ผลที่ตามมา: เลขานุการที่ไม่ได้เป็นผู้จัดและไม่ได้รับมอบสิทธิ์ จะแก้ประชุมของคณะ
// ตัวเองผ่าน API ไม่ได้ ปลดล็อกได้เมื่อย้ายข้อมูลคณะทำงานขึ้น DB แล้วใส่ใน JWT
// ═══════════════════════════════════════════

import type { MeetingPayload } from '../repositories/meetings';

export type Actor = { id: string; role: string };

function permissionType(meeting: MeetingPayload, userId: string): string | null {
  const list = Array.isArray(meeting.permissions) ? meeting.permissions : [];
  const found = list.find((p) => p?.userId === userId);
  return found ? found.type : null;
}

function isParticipant(meeting: MeetingPayload, userId: string): boolean {
  const list = Array.isArray(meeting.participants) ? meeting.participants : [];
  return list.some((p) => p?.userId === userId || p?.id === userId);
}

export function canViewMeeting(actor: Actor, meeting: MeetingPayload): boolean {
  if (actor.role === 'admin') return true;
  if (meeting.organizerId === actor.id) return true;
  if (isParticipant(meeting, actor.id)) return true;
  if (permissionType(meeting, actor.id)) return true;
  // ผู้บริหารมีหน้าที่กำกับดูแล จึงดูข้ามคณะได้ (ตรงกับกฎฝั่งหน้าเว็บ)
  return actor.role === 'executive';
}

export function canEditMeeting(actor: Actor, meeting: MeetingPayload): boolean {
  if (actor.role === 'admin') return true;
  if (meeting.organizerId === actor.id) return true;
  return permissionType(meeting, actor.id) === 'manager';
}

/** ใครสร้างการประชุมใหม่ได้ — guest กับบัญชีห้องประชุมสร้างไม่ได้ */
export function canCreateMeeting(actor: Actor): boolean {
  return ['admin', 'secretary', 'executive', 'staff'].includes(actor.role);
}

// ───────── สิทธิ์ระดับไฟล์ ─────────

/** ข้อมูลไฟล์เท่าที่ใช้ตัดสินสิทธิ์ — อยู่ใน payload.files ของการประชุม */
export type FileEntry = {
  id?: string;
  storageKey?: string;
  visibility?: string;
  allowedUserIds?: string[];
  allowedPositions?: string[];
};

/** หาไฟล์ใน payload จาก id ที่ใช้เก็บจริง (storageKey) หรือ id ของรายการ */
export function findFileEntry(meeting: MeetingPayload, fileId: string): FileEntry | null {
  const files = Array.isArray(meeting.files) ? (meeting.files as FileEntry[]) : [];
  return files.find((f) => f?.storageKey === fileId || f?.id === fileId) ?? null;
}

/**
 * พอร์ตมาจาก canViewFile() ใน src/data/index.ts — ตัดกฎที่อิงคณะทำงานออก
 * ด้วยเหตุผลเดียวกับหัวไฟล์ ไฟล์ระดับ committee จึงเหลือแค่ผู้เข้าร่วมกับผู้จัด
 *
 * ไฟล์ที่ไม่มีรายการใน payload ถือว่าเข้าถึงไม่ได้ — ปฏิเสธไว้ก่อนปลอดภัยกว่า
 */
export function canViewFile(
  actor: Actor,
  meeting: MeetingPayload,
  file: FileEntry | null
): boolean {
  if (actor.role === 'admin') return true;
  if (!file) return false;

  if (file.visibility === 'public') return true;

  const inWhitelist = Boolean(file.allowedUserIds?.includes(actor.id));
  if (actor.role === 'external') return inWhitelist;

  const isOrganizer = meeting.organizerId === actor.id;
  const participants = Array.isArray(meeting.participants) ? meeting.participants : [];
  const myParticipant = participants.find((p) => p?.userId === actor.id || p?.id === actor.id);

  if (file.visibility === 'restricted') {
    if (inWhitelist) return true;
    if (file.allowedPositions?.length && myParticipant) {
      const position = (myParticipant as { position?: string }).position;
      if (position && file.allowedPositions.includes(position)) return true;
    }
    return isOrganizer;
  }

  if (file.visibility === 'participants' || file.visibility === 'committee') {
    return Boolean(myParticipant) || isOrganizer;
  }

  return false;
}
