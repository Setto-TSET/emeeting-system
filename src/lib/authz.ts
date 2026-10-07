// ═══════════════════════════════════════════
// Authorization — "คนนี้ทำสิ่งนี้กับของชิ้นนี้ได้ไหม"
//
// ⚠️ ข้อกำหนดสำคัญของไฟล์นี้: ต้องเป็น pure function ล้วน
//    - ห้าม import React / hook / localStorage / context
//    - ห้ามอ่านข้อมูลจากที่อื่นนอกจาก argument ที่รับเข้ามา
//    เหตุผล: การเช็คสิทธิ์ฝั่ง browser เป็นแค่เครื่องสำอาง ใครแก้ localStorage ก็ข้ามได้
//    ของจริงต้องบังคับที่ server — ไฟล์นี้ออกแบบให้ "ก๊อปไปวางฝั่ง backend ได้ทั้งไฟล์"
//
// แบ่งหน้าที่กับไฟล์ข้างเคียง:
//    access.ts      → เมนูและ route (หยาบ: participant | manager)
//    authz.ts       → การกระทำรายชิ้น (ละเอียด: ใครทำอะไรกับประชุมไหนได้)
//    canViewFile()  → สิทธิ์ระดับไฟล์ (อยู่ใน data/index.ts)
// ═══════════════════════════════════════════

import { AppUser, Meeting } from "@/data";

/** สิ่งที่ผู้ใช้ทำกับการประชุมหนึ่งๆ ได้ */
export type MeetingAction =
  | "meeting.view"              // เปิดดูรายละเอียด
  | "meeting.edit"              // แก้ข้อมูล/วาระ/ไฟล์
  | "meeting.manageParticipants" // เพิ่ม-ลบองค์ประชุม, เช็คชื่อ
  | "meeting.managePermissions"  // มอบ/ถอนสิทธิ์คนอื่น
  | "meeting.notify"            // ส่งอีเมลแจ้งวาระถึงองค์ประชุมทุกคน
  | "meeting.changeStatus"      // เปิด/ปิดประชุม
  | "meeting.endorse"           // รับรองรายงาน (ย้อนกลับไม่ได้)
  | "meeting.host"              // คุมห้องประชุมออนไลน์ (แชร์จอ/กำหนดวาระ)
  | "meeting.join"              // เข้าห้องประชุมออนไลน์
  | "meeting.manageVoting";     // สร้าง/ปิดโหวตในห้องประชุม

// ───────── ความสัมพันธ์ระหว่างคนกับประชุม (คำนวณจาก id เท่านั้น) ─────────

export function isAdmin(user: AppUser): boolean {
  return user.systemRole === "admin";
}

export function isOrganizer(user: AppUser, meeting: Meeting): boolean {
  return meeting.organizerId === user.id;
}

/** ได้รับมอบสิทธิ์ผู้จัดการประชุมนี้โดยตรง */
export function isDelegatedManager(user: AppUser, meeting: Meeting): boolean {
  return meeting.permissions.some((p) => p.userId === user.id && p.type === "manager");
}

export function isParticipantOf(user: AppUser, meeting: Meeting): boolean {
  return meeting.participants.some((p) => p.userId !== null && p.userId === user.id);
}

/**
 * มีสิทธิ์ระดับ "ผู้ดูแลการประชุมนี้" หรือไม่ — ใช้เป็นฐานของ action ส่วนใหญ่
 *
 * ต้องตรงกับ canEditMeeting ใน backend/src/services/meetingAccess.ts — เดิมหน้าเว็บนับ
 * "เลขาฯ/ผู้บริหารของคณะ" เป็นผู้ดูแลด้วย แต่ server ไม่มีข้อมูลคณะของผู้ใช้ ปุ่มจึงโผล่ให้กด
 * แล้วทุกการบันทึกโดน 403 เงียบ ๆ จนกว่าจะย้ายข้อมูลคณะขึ้น DB อย่าเพิ่มกฎที่ server ตรวจไม่ได้
 */
function isManagerOfMeeting(user: AppUser, meeting: Meeting): boolean {
  return isAdmin(user) || isOrganizer(user, meeting) || isDelegatedManager(user, meeting);
}

// ───────── จุดตัดสินหลัก ─────────

/**
 * ตัดสินว่าผู้ใช้ทำ action นี้กับการประชุมนี้ได้ไหม
 *
 * หมายเหตุ: ฟังก์ชันนี้ไม่สนใจ "สถานะการประชุม" — ผู้เรียกต้องเช็คเองเพิ่ม
 * เช่น แก้ไขได้ก็จริง แต่ประชุมที่รับรองแล้วต้องล็อก (ดู canEditMeeting)
 */
export function can(user: AppUser, action: MeetingAction, meeting: Meeting): boolean {
  // admin ผ่านทุกอย่าง — รวมไว้จุดเดียว ไม่กระจายไปเช็คตามที่ต่างๆ
  if (isAdmin(user)) return true;

  // แขกที่เข้ามาด้วยลิงก์เชิญ — ไม่มีแถวใน participants เพราะไม่มีบัญชีในระบบ
  // token ของแขกผูกกับการประชุมเดียว และ backend ส่งกลับมาแค่ห้องนั้นห้องเดียว
  // (ดู listMeetingsForUser / canViewMeeting ฝั่ง server) ที่นี่จึงเหลือแค่ปลดหน้าจอให้ตรงกัน
  if (user.id.startsWith("guest-")) {
    return action === "meeting.view" || action === "meeting.join";
  }

  // room account — เข้าร่วมและดูได้เฉพาะประชุมที่จัดในห้องนี้
  if (user.systemRole === "room") {
    const isInMyRoom =
      meeting.location.includes(user.name) ||
      meeting.participants.some((p) => p.userId === user.id);
    if (action === "meeting.view" || action === "meeting.join") return isInMyRoom;
    return false;
  }

  const isManager = isManagerOfMeeting(user, meeting);

  switch (action) {
    case "meeting.view":
      // ผู้บริหารดูข้ามคณะได้ (บทบาทเน้นกำกับดูแล)
      return (
        isManager ||
        isParticipantOf(user, meeting) ||
        user.systemRole === "executive" ||
        meeting.permissions.some((p) => p.userId === user.id)
      );

    case "meeting.edit":
    case "meeting.manageParticipants":
    case "meeting.changeStatus":
    case "meeting.notify":
    case "meeting.endorse":
    case "meeting.host":
    case "meeting.manageVoting":
      return isManager;

    // มอบสิทธิ์ให้คนอื่นได้เฉพาะเจ้าของงานจริง — ผู้รับมอบสิทธิ์ต่อสิทธิ์ไม่ได้
    case "meeting.managePermissions":
      return isOrganizer(user, meeting);

    case "meeting.join":
      return isManager || isParticipantOf(user, meeting);

    default:
      return false;
  }
}

/**
 * แก้ไขได้จริงไหม — รวมสิทธิ์ + สถานะเข้าด้วยกัน
 * ประชุมที่รับรองแล้วถือว่าปิดถาวร แม้แต่ admin ก็ไม่ควรแก้ย้อนหลัง
 */
export function canEditMeeting(user: AppUser, meeting: Meeting): boolean {
  return can(user, "meeting.edit", meeting) && meeting.status !== "endorsed";
}

/** สร้างการประชุมใหม่ได้ไหม — ไม่ผูกกับประชุมใดประชุมหนึ่ง */
export function canCreateMeeting(user: AppUser): boolean {
  // ตรงกับ canCreateMeeting ฝั่ง server — เจ้าหน้าที่ (staff) เป็นผู้จัดประชุมได้
  return ["admin", "secretary", "executive", "staff"].includes(user.systemRole);
}

/** ข้อความอธิบายว่าทำไมทำไม่ได้ — ใช้เป็น tooltip ให้ผู้ใช้เข้าใจ ไม่ใช่เดาเอง */
export function denialReason(user: AppUser, action: MeetingAction, meeting: Meeting): string {
  if (meeting.status === "endorsed" && action === "meeting.edit") {
    return "การประชุมนี้รับรองแล้ว ไม่สามารถแก้ไขได้";
  }
  return "เฉพาะผู้จัดการประชุมหรือผู้ที่ได้รับมอบสิทธิ์ผู้จัดการเท่านั้น — ติดต่อผู้จัดเพื่อขอสิทธิ์";
}
