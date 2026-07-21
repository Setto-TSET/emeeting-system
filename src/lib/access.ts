// ═══════════════════════════════════════════
// Role-based UI Access
// จุดเดียวที่ตัดสินว่าแต่ละสิทธิ์เห็นเมนูอะไร และเข้าหน้าไหนได้บ้าง
//
// คู่กับ canViewFile() ใน data/index.ts ที่คุมระดับ "ไฟล์"
// ไฟล์นี้คุมระดับ "หน้าจอ/เมนู"
// ═══════════════════════════════════════════

import { SystemRole } from "@/data";

/**
 * participant = ผู้เข้าร่วมประชุม เห็นแค่ประชุมของตัวเอง + เอกสาร (ดูอย่างเดียว)
 * manager     = ผู้จัด/ดูแล เห็นเมนูครบทั้งระบบ
 *
 * ปรับได้ที่ตารางนี้จุดเดียว ถ้าอยากย้าย executive ไปเป็น participant
 */
export type AccessLevel = "participant" | "manager";

const roleAccessLevel: Record<SystemRole, AccessLevel> = {
  admin: "manager",
  secretary: "manager",
  executive: "manager",
  staff: "participant",
  external: "participant",
};

export function getAccessLevel(role: SystemRole): AccessLevel {
  return roleAccessLevel[role] ?? "participant";
}

export function isParticipant(role: SystemRole): boolean {
  return getAccessLevel(role) === "participant";
}

export type NavItem = { href: string; icon: string; label: string };
export type NavGroup = { groupLabel?: string; items: NavItem[] };

/** เมนูของผู้เข้าร่วม — หน้าหลัก / การประชุมของฉัน / เอกสาร เท่านั้น */
const participantNav: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", icon: "home", label: "หน้าหลัก" },
      { href: "/portal", icon: "event_note", label: "การประชุมของฉัน" },
      { href: "/documents", icon: "folder_shared", label: "เอกสารการประชุม" },
    ],
  },
];

/** เมนูเต็มสำหรับผู้จัด/ผู้ดูแล */
const managerNav: NavGroup[] = [
  {
    groupLabel: "ภาพรวม",
    items: [
      { href: "/dashboard", icon: "dashboard", label: "หน้าหลัก" },
      { href: "/portal", icon: "event_seat", label: "พอร์ทัลผู้เข้าร่วม" },
    ],
  },
  {
    groupLabel: "จองห้องประชุม",
    items: [
      { href: "/booking", icon: "event_available", label: "ปฏิทินและจองห้อง" },
      { href: "/booking/my-bookings", icon: "bookmark", label: "การจองของฉัน" },
      { href: "/rooms", icon: "meeting_room", label: "ห้องประชุมทั้งหมด" },
    ],
  },
  {
    groupLabel: "บริหารการประชุม",
    items: [
      { href: "/meetings", icon: "groups", label: "รายการการประชุม" },
      { href: "/meetings/new", icon: "add_circle", label: "สร้างการประชุม" },
      { href: "/committees", icon: "diversity_3", label: "คณะทำงาน" },
    ],
  },
  {
    groupLabel: "รายงาน / เอกสาร",
    items: [
      { href: "/reports", icon: "description", label: "รายงานการประชุม" },
      { href: "/documents", icon: "folder_shared", label: "คลังเอกสาร" },
    ],
  },
];

export function getNavGroups(role: SystemRole): NavGroup[] {
  return isParticipant(role) ? participantNav : managerNav;
}

/** หน้าที่ผู้เข้าร่วมเข้าได้ — นอกจากนี้เด้งกลับหน้าหลัก */
const participantAllowedPrefixes = ["/dashboard", "/portal", "/documents", "/live"];

/**
 * กันการพิมพ์ URL ตรงเพื่อข้ามเมนู
 * ซ่อนเมนูอย่างเดียวไม่พอ เพราะ /booking ยังพิมพ์เข้าได้อยู่
 */
export function canAccessRoute(role: SystemRole, pathname: string): boolean {
  if (!isParticipant(role)) return true;
  return participantAllowedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/** หน้าหลักของทุกสิทธิ์ — /dashboard ปรับเนื้อหาตามสิทธิ์อยู่แล้ว */
export const HOME_ROUTE = "/dashboard";
