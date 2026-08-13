// ══════════════════════════════════════════════════════
// Meeting System — Mock Data
// รวมข้อมูล ระบบจองห้องประชุม + ระบบบริหารการประชุม (e-Meeting)
// ══════════════════════════════════════════════════════

import type { ConferenceProvider } from "@/lib/conference";

// ===== Institution =====
export const institutionInfo = {
  nameTh: "ระบบบริหารการประชุมและจองห้องประชุม",
  nameEn: "e-Meeting & Room Booking System",
  parentOrg: "e-Office",
  address: "ศูนย์ประชุมและสัมมนา สำนักงานใหญ่",
  phone: "0-2591-9992",
  emails: { general: "notify@e-office.cloud" },
};

// ===== System Roles =====
export type SystemRole =
  | "admin"       // ผู้ดูแลระบบ — เห็นทุกอย่าง
  | "executive"   // ผู้บริหาร — เห็นเอกสารระดับผู้บริหาร + คณะที่ตัวเองเป็นสมาชิก
  | "secretary"  // เลขานุการ — เห็น + จัดการเอกสารในคณะที่รับผิดชอบ
  | "staff"      // เจ้าหน้าที่ทั่วไป — เห็นเฉพาะเอกสารที่มีสิทธิ์
  | "external";  // บุคคลภายนอก — เห็นเฉพาะเอกสารสาธารณะที่ส่งให้เท่านั้น

export const systemRoleLabels: Record<SystemRole, string> = {
  admin: "ผู้ดูแลระบบ",
  executive: "ผู้บริหาร",
  secretary: "เลขานุการ",
  staff: "เจ้าหน้าที่",
  external: "บุคคลภายนอก",
};

export const systemRoleColors: Record<SystemRole, string> = {
  admin: "bg-rose-100 text-rose-700 border-rose-300",
  executive: "bg-indigo-100 text-indigo-700 border-indigo-300",
  secretary: "bg-blue-100 text-blue-700 border-blue-300",
  staff: "bg-slate-100 text-slate-700 border-slate-300",
  external: "bg-amber-100 text-amber-800 border-amber-300",
};

export const systemRoleDescriptions: Record<SystemRole, string> = {
  admin: "เข้าถึงและจัดการเอกสารได้ทั้งระบบ",
  executive: "เห็นเอกสารระดับผู้บริหาร + คณะที่ตนเองสังกัด",
  secretary: "จัดการวาระ/เอกสารของคณะที่รับผิดชอบ",
  staff: "เห็นเฉพาะเอกสารสาธารณะ + เอกสารที่มีสิทธิ์เท่านั้น",
  external: "เข้าถึงได้เฉพาะเอกสารสาธารณะที่ถูกส่งให้",
};

// ===== Users (สำหรับสลับทดสอบสิทธิ์) =====
export type AppUser = {
  id: string;
  name: string;
  position: string;    // ตำแหน่งงาน
  department: string;
  email: string;
  systemRole: SystemRole;
  committeeIds: string[];  // คณะที่สังกัด
};

export const users: AppUser[] = [
  {
    id: "U-001",
    name: "นาย สมชาย ใจดี",
    position: "เจ้าหน้าที่บริหารงานทั่วไป",
    department: "สำนักบริหาร",
    email: "somchai.j@e-office.cloud",
    systemRole: "staff",
    committeeIds: ["COM-01", "COM-02"],
  },
  {
    id: "U-002",
    name: "นาย ประเสริฐ มั่นคง",
    position: "ผู้อำนวยการ",
    department: "สำนักผู้บริหาร",
    email: "prasert@e-office.cloud",
    systemRole: "executive",
    committeeIds: ["COM-01", "COM-05"],
  },
  {
    id: "U-003",
    name: "นางสาว มาลี รักษาสัตย์",
    position: "หัวหน้าฝ่ายเลขา",
    department: "สำนักผู้บริหาร",
    email: "malee.r@e-office.cloud",
    systemRole: "secretary",
    committeeIds: ["COM-01"],
  },
  {
    id: "U-004",
    name: "นาง วิภา สุขใจ",
    position: "หัวหน้าฝ่ายบุคคล",
    department: "ฝ่ายทรัพยากรบุคคล",
    email: "wipha.s@e-office.cloud",
    systemRole: "staff",
    committeeIds: ["COM-01"],
  },
  {
    id: "U-005",
    name: "นาย เดชา เก่งจริง",
    position: "Tech Lead",
    department: "ฝ่ายเทคโนโลยี",
    email: "decha@e-office.cloud",
    systemRole: "staff",
    committeeIds: ["COM-02", "COM-03"],
  },
  {
    id: "U-999",
    name: "IT Admin",
    position: "System Administrator",
    department: "ฝ่ายไอที",
    email: "admin@e-office.cloud",
    systemRole: "admin",
    committeeIds: [],
  },
  {
    id: "U-EXT-01",
    name: "นาย ที่ปรึกษา ผู้ทรงคุณวุฒิ",
    position: "ผู้ทรงคุณวุฒิภายนอก",
    department: "-",
    email: "expert@external.org",
    systemRole: "external",
    committeeIds: ["COM-01"],
  },
];

// หมายเหตุ: เดิมมี `export const currentUser = users[0]` ตรงนี้
// ลบออกเพราะเป็นต้นเหตุที่หน้าจองแสดงข้อมูลของผู้ใช้คนแรกเสมอไม่ว่าจะล็อกอินเป็นใคร
// ต้องการผู้ใช้ปัจจุบันให้ใช้ useCurrentUser() จาก @/context/UserContext เท่านั้น

// ===== Notifications =====
export const notificationsData = [
  { id: 1, type: "info", title: "แจ้งวาระการประชุม", message: "คุณได้รับแจ้งวาระการประชุมคณะกรรมการบริหาร ครั้งที่ 7/2569", time: "5 นาทีที่แล้ว", isRead: false },
  { id: 2, type: "success", title: "จองห้องสำเร็จ", message: "จองห้องประชุม A-301 วันที่ 20 ก.ค. 2569 เวลา 13:00-15:00 น. สำเร็จ", time: "1 ชั่วโมงที่แล้ว", isRead: false },
  { id: 3, type: "warning", title: "รอรับรองการประชุม", message: "การประชุมคณะทำงานฯ ครั้งที่ 3/2569 รอการรับรอง", time: "3 ชั่วโมงที่แล้ว", isRead: true },
  { id: 4, type: "info", title: "การประชุมใกล้ถึง", message: "การประชุมทีมพัฒนาผลิตภัณฑ์ จะเริ่มในอีก 30 นาที", time: "เมื่อวานนี้", isRead: true },
];

// ===== Meeting Rooms =====
export type Room = {
  id: string;
  name: string;
  category: "small" | "medium" | "large" | "conference" | "board";
  categoryLabel: string;
  capacity: number;
  location: string;
  floor: string;
  amenities: string[];
  image?: string;
  status: "available" | "occupied" | "maintenance";
  hasZoomRoom?: boolean;
  zoomRoomDeviceId?: string;
  hasIpad?: boolean;
};

// ห้องประชุมจริงขององค์กร — ตัดห้องจำลอง (A-101 ฯลฯ) ออกหมดแล้ว เหลือ 3 ห้องที่ใช้งานจริง
export const meetingRooms: Room[] = [
  { id: "R-801", name: "ห้องประชุม 801", category: "medium", categoryLabel: "ห้องประชุมกลาง", capacity: 20, location: "อาคารสำนักงาน", floor: "ชั้น 8", amenities: ["โปรเจกเตอร์", "ระบบเสียง", "Video Conference"], status: "available" },
  { id: "R-808", name: "ห้องประชุม 808", category: "medium", categoryLabel: "ห้องประชุมกลาง", capacity: 20, location: "อาคารสำนักงาน", floor: "ชั้น 8", amenities: ["โปรเจกเตอร์", "ระบบเสียง", "Video Conference"], status: "available" },
  { id: "R-901", name: "ห้องประชุม 901", category: "medium", categoryLabel: "ห้องประชุมกลาง", capacity: 20, location: "อาคารสำนักงาน", floor: "ชั้น 9", amenities: ["โปรเจกเตอร์", "ระบบเสียง", "Video Conference"], status: "available" },
];

// ===== Room Bookings =====
export type Booking = {
  id: string;
  roomId: string;
  roomName: string;
  title: string;
  /** id ผู้จอง — ใช้ตัดสินว่าเป็นการจองของใคร (bookedBy เป็นแค่ชื่อสำหรับแสดงผล) */
  bookedById: string;
  bookedBy: string;
  department: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;
  attendees: number;
  purpose: string;
  status: "confirmed" | "pending" | "cancelled";
  extraRooms?: string[];
};

// ยังไม่มีการจองจริง — ตัดข้อมูลจองห้องจำลองที่อ้างอิงห้องเก่า (A-101 ฯลฯ) ออกหมดแล้ว
export const bookings: Booking[] = [];

// ===== Meetings (e-Meeting) =====
export type MeetingStatus =
  | "prepare"        // 1. เตรียมวาระ
  | "notified"       // 2. แจ้งวาระ
  | "in_progress"    // 3. ดำเนินการประชุม
  | "waiting_endorse"// 4. รอรับรองการประชุม
  | "endorsed";      // 5. รับรองแล้ว

export const meetingStatusLabels: Record<MeetingStatus, string> = {
  prepare: "1. เตรียมวาระ",
  notified: "2. แจ้งวาระ",
  in_progress: "3. ดำเนินการประชุม",
  waiting_endorse: "4. รอรับรองการประชุม",
  endorsed: "5. รับรองแล้ว",
};

export const meetingStatusColors: Record<MeetingStatus, string> = {
  prepare: "bg-slate-100 text-slate-700 border-slate-300",
  notified: "bg-blue-100 text-blue-700 border-blue-300",
  in_progress: "bg-amber-100 text-amber-800 border-amber-300",
  waiting_endorse: "bg-purple-100 text-purple-700 border-purple-300",
  endorsed: "bg-green-100 text-green-700 border-green-300",
};

export type MeetingParticipant = {
  id: string;
  /** id ผู้ใช้ในระบบ — null = บุคคลภายนอกที่ไม่มีบัญชี (ตรงกับที่ฐานข้อมูลจะเก็บ) */
  userId: string | null;
  name: string;
  position: string;             // ตำแหน่งในที่ประชุม เช่น ประธาน, เลขานุการ
  role: string;                 // ตำแหน่งจริง
  department: string;
  email: string;
  attendance?: "attend" | "representative" | "absent" | "pending";
  present?: boolean;            // มาเข้าร่วมจริง
  inSystem: boolean;
};

export type FileVisibility =
  | "public"        // สาธารณะ — ทุกคนในระบบเห็นได้
  | "committee"     // เฉพาะสมาชิกคณะทำงานนั้น
  | "participants"  // เฉพาะผู้เข้าร่วมประชุมครั้งนั้น
  | "restricted";   // จำกัดเฉพาะรายชื่อ/ตำแหน่งที่กำหนด

export const fileVisibilityLabels: Record<FileVisibility, string> = {
  public: "สาธารณะ",
  committee: "เฉพาะคณะทำงาน",
  participants: "เฉพาะผู้เข้าร่วม",
  restricted: "จำกัดสิทธิ์",
};

export const fileVisibilityColors: Record<FileVisibility, string> = {
  public: "bg-green-100 text-green-700 border-green-300",
  committee: "bg-blue-100 text-blue-700 border-blue-300",
  participants: "bg-amber-100 text-amber-800 border-amber-300",
  restricted: "bg-rose-100 text-rose-700 border-rose-300",
};

export const fileVisibilityIcons: Record<FileVisibility, string> = {
  public: "public",
  committee: "groups",
  participants: "how_to_reg",
  restricted: "lock",
};

export type MeetingFile = {
  id: string;
  name: string;
  description: string;
  size: string;
  uploadedAt: string;
  uploadedBy: string;
  type: "regulation" | "attachment" | "report_draft" | "report_final";
  visibility: FileVisibility;
  allowedPositions?: string[];   // เช่น ["ประธาน","เลขานุการ"]
  allowedUserIds?: string[];     // whitelist รายบุคคล (AppUser.id)
  /** กุญแจไฟล์ใน IndexedDB — ถ้ามี = อัปโหลดจริง, ไม่มี = ตัวอย่าง render simulated */
  storageKey?: string;
  mimeType?: string;
  sizeBytes?: number;
};

export const fileTypeLabels: Record<MeetingFile["type"], string> = {
  regulation: "ระเบียบ/คำสั่ง",
  attachment: "เอกสารประกอบ",
  report_draft: "ร่างรายงาน",
  report_final: "รายงานฉบับสมบูรณ์",
};

export type MeetingAgendaItem = {
  id: string;
  no: string;                   // เช่น 1, 1.1, 2
  title: string;
  detail?: string;
  secretGroupId?: string | null;
  comments: { by: string; text: string; time: string }[];
};

export type ZoomRoomDevice = {
  id: string;
  name: string;
  roomId: string;
  sipAddress?: string;
  status: "invited" | "connected" | "disconnected";
};

export type Meeting = {
  id: string;
  name: string;
  shortName: string;
  type: string;
  committee: string;
  /** id คณะทำงาน — ใช้ตัดสินสิทธิ์ (committee เป็นแค่ชื่อสำหรับแสดงผล) */
  committeeId: string;
  /** id ผู้จัด — ใช้ตัดสินสิทธิ์ (organizer/organizerEmail ใช้แสดงผลและส่งอีเมล) */
  organizerId: string | null;
  organizer: string;
  organizerEmail: string;
  emailSenderName: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  conferenceLink?: string;
  /** แพลตฟอร์มประชุมออนไลน์ — ไม่ระบุ = ระบบเดาจาก conferenceLink (ดู lib/conference.ts) */
  conferenceProvider?: ConferenceProvider;
  status: MeetingStatus;
  displayFormat: number;        // 1-6
  participants: MeetingParticipant[];
  files: MeetingFile[];
  agenda: MeetingAgendaItem[];
  secretGroups: { id: string; name: string; participantIds: string[] }[];
  permissions: { userId: string; name: string; type: "manager" | "reader" }[];
  extraTextBoxes?: { id: string; name: string }[];
  /** รายละเอียด/วัตถุประสงค์เพิ่มเติมของประชุม — กรอกตอนสร้าง */
  description?: string;
  savedToDrive: boolean;
  createdAt: string;
  /**
   * เปิดให้บุคคลภายนอกที่ได้รับลิงก์เข้าห้องประชุมเองได้หรือไม่
   * ค่าเริ่มต้นคือปิด — เดิมใครเปิด URL ก็เดินเข้าประชุมที่ไม่ได้ถูกเชิญได้
   * ผู้จัดเปิดสวิตช์นี้เมื่อมีวิทยากร/ผู้ทรงคุณวุฒิภายนอกที่ไม่ได้อยู่ในระบบ
   */
  allowGuestJoin?: boolean;
  /**
   * กุญแจห้องประชุมที่เดาไม่ได้ — สำหรับเครื่องยนต์ที่ฝังในเว็บ (ZegoCloud)
   * ห้ามใช้ meeting.id เป็นชื่อห้องตรงๆ ไม่งั้นใครเดา id ได้ก็เข้าห้องลับได้
   * backend แลกกุญแจนี้เป็นห้องจริงของผู้ให้บริการ
   */
  conferenceRoomKey?: string;
  /** สถานะการถอดเสียง — none | processing | ready | failed (ดู services/transcription) */
  transcriptStatus?: "none" | "processing" | "ready" | "failed";
  /** id ของร่างรายงานที่ AI สรุปให้ (ผูกกับไฟล์ report_draft) — เลขาฯ แก้ก่อนรับรอง */
  summaryDraftId?: string;
  /** วาระที่กำลังพูดคุยอยู่ในห้องประชุมออนไลน์ */
  activeAgendaId?: string | null;
  /** ข้อความแชทระหว่างการประชุมออนไลน์ */
  chatMessages?: MeetingChatMessage[];
  /**
   * ระดับความลับของการประชุม
   * normal    = ทั่วไป (default)
   * restricted = ลับ — watermark เข้ม, แถบแดงเตือน
   * top_secret = ลับมาก — user-select: none, watermark refresh ทุก 5 วิ
   */
  confidentialityLevel?: "normal" | "restricted" | "top_secret";
  /** วันเวลาที่ส่งแจ้งวาระ */
  notifiedAt?: string;
  /** วันเวลาที่ส่ง reminder (1 วันก่อนประชุม) */
  reminderSentAt?: string;
  /** อุปกรณ์ Zoom Room ที่เชิญเข้าประชุม (Phase D — ZegoCloud + Zoom Room integration) */
  zoomRoomDevices?: ZoomRoomDevice[];
  /** SIP URI ของห้อง ZegoCloud สำหรับ Zoom Room dial-in — backend สร้างให้ */
  zegoSipUri?: string;
};

export type MeetingChatMessage = {
  id: string;
  sender: string;
  text: string;
  time: string;
};

export const meetings: Meeting[] = [
  // ตัดข้อมูลประชุมจำลองออกหมดแล้ว (MT-2569-005..009 + ห้องจำลอง A-101 ฯลฯ)
  // เหลือไว้แค่ห้องทดสอบ ZegoCloud นี้ เพื่อใช้ตรวจสอบวิดีโอจริงก่อน deploy —
  // อัปเดตให้ใช้ห้องประชุม 801 จริงแทนห้องจำลอง A-301 เดิม
  {
    id: "MT-2569-010",
    name: "การประชุมออนไลน์ทดสอบ ZegoCloud ครั้งที่ 1/2569",
    shortName: "ZegoCloud Test 1/69",
    type: "การประชุมทดสอบ",
    committeeId: "COM-03",
    committee: "คณะทำงานพัฒนา e-Office",
    organizerId: "U-001",
    organizer: "นาย สมชาย ใจดี",
    organizerEmail: "somchai.j@e-office.cloud",
    emailSenderName: "e-office",
    date: "2026-08-13",
    startTime: "10:00",
    endTime: "11:30",
    location: "ห้องประชุม 801 + ออนไลน์",
    conferenceProvider: "zegocloud",
    conferenceRoomKey: "emeeting-zego-test-001",
    status: "in_progress",
    displayFormat: 2,
    // องค์ประชุมทดสอบ — ครบทุกบทบาทในระบบ เพื่อสลับผู้ใช้แล้วเข้าห้องเดียวกันจากหลายแท็บ
    // ชื่อ/อีเมลต้องตรงกับ users ด้านบนทุกช่อง เดิมตั้งชื่อมั่วทำให้จับคู่ผู้ใช้ไม่ได้
    // present เป็น false หมด — สถานะ "อยู่ในสาย" ต้องมาจากการเข้าห้องจริงเท่านั้น
    participants: [
      { id: "P-Z1", name: "นาย สมชาย ใจดี", position: "ประธาน", role: "เจ้าหน้าที่บริหารงานทั่วไป", department: "สำนักบริหาร", userId: "U-001", email: "somchai.j@e-office.cloud", inSystem: true, present: false, attendance: "attend" },
      { id: "P-Z2", name: "นาย ประเสริฐ มั่นคง", position: "ผู้บริหาร", role: "ผู้อำนวยการ", department: "สำนักผู้บริหาร", userId: "U-002", email: "prasert@e-office.cloud", inSystem: true, present: false, attendance: "attend" },
      { id: "P-Z3", name: "นางสาว มาลี รักษาสัตย์", position: "เลขานุการ", role: "หัวหน้าฝ่ายเลขา", department: "สำนักผู้บริหาร", userId: "U-003", email: "malee.r@e-office.cloud", inSystem: true, present: false, attendance: "attend" },
      { id: "P-Z4", name: "นาย เดชา เก่งจริง", position: "กรรมการ", role: "Tech Lead", department: "ฝ่ายเทคโนโลยี", userId: "U-005", email: "decha@e-office.cloud", inSystem: true, present: false, attendance: "attend" },
      { id: "P-Z5", name: "นาย ที่ปรึกษา ผู้ทรงคุณวุฒิ", position: "ผู้ทรงคุณวุฒิภายนอก", role: "ผู้ทรงคุณวุฒิภายนอก", department: "-", userId: "U-EXT-01", email: "expert@external.org", inSystem: true, present: false, attendance: "attend" },
    ],
    // เปิดให้คนนอกที่มีลิงก์เข้าเองได้ — ใช้ทดสอบหลายเครื่อง/หลายหน้าต่างพร้อมกัน
    allowGuestJoin: true,
    files: [],
    agenda: [
      { id: "AZ-1", no: "1", title: "ทดสอบระบบ ZegoCloud", comments: [] },
      { id: "AZ-2", no: "2", title: "ทดสอบการเชื่อมต่อ Zoom Room", comments: [] },
    ],
    secretGroups: [],
    permissions: [
      { userId: "U-001", name: "นาย สมชาย ใจดี", type: "manager" },
      { userId: "U-003", name: "นางสาว มาลี รักษาสัตย์", type: "manager" },
    ],
    savedToDrive: false,
    createdAt: "2026-08-01",
    zoomRoomDevices: [
      { id: "ZRD-1", name: "Zoom Room ห้อง 801", roomId: "R-801", status: "invited" },
    ],
  },
];

// ===== Committees =====
// meetingsCount/members นับจากข้อมูลจริงในระบบ (users[].committeeIds + meetings[]) ไม่ใช่ตัวเลขมั่วแล้ว
export const committees = [
  { id: "COM-01", name: "คณะกรรมการบริหาร", meetingsCount: 0, members: 5 },
  { id: "COM-02", name: "ทีมพัฒนาผลิตภัณฑ์", meetingsCount: 0, members: 2 },
  { id: "COM-03", name: "คณะทำงานพัฒนา e-Office", meetingsCount: 1, members: 1 },
  { id: "COM-04", name: "คณะทำงานความปลอดภัยข้อมูล", meetingsCount: 0, members: 0 },
  { id: "COM-05", name: "คณะกรรมการตรวจสอบภายใน", meetingsCount: 0, members: 1 },
];

// ===== Display Formats =====
export const displayFormats = [
  { id: 1, label: "ชื่อ-สกุล เท่านั้น", example: "นาย สมชาย ใจดี" },
  { id: 2, label: "ตำแหน่ง — ชื่อ-สกุล (หน่วยงาน)", example: "ประธาน — นาย สมชาย ใจดี (สำนักบริหาร)" },
  { id: 3, label: "ชื่อ-สกุล — ตำแหน่ง", example: "นาย สมชาย ใจดี — เจ้าหน้าที่บริหารงานทั่วไป" },
  { id: 4, label: "ชื่อ-สกุล (หน่วยงาน)", example: "นาย สมชาย ใจดี (สำนักบริหาร)" },
  { id: 5, label: "หน่วยงาน — ชื่อ-สกุล", example: "สำนักบริหาร — นาย สมชาย ใจดี" },
  { id: 6, label: "แบบเต็มพร้อมตำแหน่งในที่ประชุม", example: "ประธาน: นาย สมชาย ใจดี, ตำแหน่ง: PM, สำนักบริหาร" },
];

// ═══════════════════════════════════════════
// Access Control — canViewFile
// จุดกลางจุดเดียวสำหรับตัดสินว่า user เห็นไฟล์ได้ไหม
// ═══════════════════════════════════════════
export function canViewFile(file: MeetingFile, user: AppUser, meeting: Meeting): boolean {
  // ทุกการตัดสินใจด้านล่างใช้ id เท่านั้น — ห้ามเทียบ email หรือชื่อ
  // เพราะชื่อ/อีเมลเปลี่ยนได้ และเคยทำให้สิทธิ์พังมาแล้ว
  const isParticipantOfMeeting = meeting.participants.some(
    (p) => p.userId !== null && p.userId === user.id
  );
  const isOrganizer = meeting.organizerId === user.id;
  const isInCommittee = user.committeeIds.includes(meeting.committeeId);

  // 1. admin เห็นทุกอย่าง
  if (user.systemRole === "admin") return true;

  // 2. public เห็นได้ทุกคน
  if (file.visibility === "public") return true;

  // external เห็นได้เฉพาะ public (ผ่านข้อ 2 ไปแล้ว) — ที่เหลือ block
  if (user.systemRole === "external") {
    // ยกเว้น: อยู่ใน allowedUserIds
    return !!file.allowedUserIds?.includes(user.id);
  }

  // 3. restricted — เช็ค whitelist
  if (file.visibility === "restricted") {
    if (file.allowedUserIds?.includes(user.id)) return true;
    if (file.allowedPositions?.length) {
      const myParticipant = meeting.participants.find(
        (p) => p.userId !== null && p.userId === user.id
      );
      if (myParticipant && file.allowedPositions.includes(myParticipant.position)) return true;
    }
    if (isOrganizer) return true;
    // ผู้บริหารที่อยู่ในคณะเดียวกันเห็นได้ (เดิมเขียนคอมเมนต์ไว้แต่ไม่ได้ทำ)
    if (user.systemRole === "executive" && isInCommittee) return true;
    return false;
  }

  // 4. participants — ต้องเป็นผู้เข้าร่วมประชุมนั้น
  if (file.visibility === "participants") {
    if (isParticipantOfMeeting) return true;
    if (isOrganizer) return true;
    return false;
  }

  // 5. committee — ต้องอยู่ในคณะทำงานเดียวกัน
  if (file.visibility === "committee") {
    if (isInCommittee) return true;
    if (isParticipantOfMeeting) return true;
    if (isOrganizer) return true;
    return false;
  }

  return false;
}

export type DocumentEntry = {
  file: MeetingFile;
  meeting: Meeting;
};

/**
 * ดึงเอกสารทั้งหมดที่ user เห็นได้ (สำหรับหน้า /documents)
 *
 * ต้องส่ง meetings เข้ามาเสมอ — ห้ามอ่านจาก const ในไฟล์นี้
 * ไม่งั้นหน้าที่เรียกจะเห็นข้อมูลแช่แข็ง ไฟล์ที่เพิ่งอัปโหลดผ่าน context จะไม่โผล่
 */
/**
 * ผู้ใช้คนนี้เกี่ยวข้องกับการประชุมนี้ไหม — เป็นองค์ประชุม / ผู้จัด / มีสิทธิ์ที่ได้รับมอบ
 *
 * เดิมตรรกะนี้ถูกเขียนซ้ำ 3 ที่ (portal, ParticipantHome, dashboard) ด้วยการเทียบอีเมล/ชื่อ
 * รวมมาไว้ที่เดียวและเปลี่ยนมาใช้ id เพื่อให้แก้เกณฑ์ครั้งเดียวมีผลทุกหน้า
 */
export function isMyMeeting(user: AppUser, meeting: Meeting): boolean {
  if (meeting.participants.some((p) => p.userId !== null && p.userId === user.id)) return true;
  if (meeting.organizerId === user.id) return true;
  if (meeting.permissions.some((p) => p.userId === user.id)) return true;
  return false;
}

export function getVisibleDocuments(user: AppUser, allMeetings: Meeting[]): DocumentEntry[] {
  const out: DocumentEntry[] = [];
  for (const m of allMeetings) {
    for (const f of m.files) {
      if (canViewFile(f, user, m)) out.push({ file: f, meeting: m });
    }
  }
  return out;
}

export const roomCategoryOptions = [
  { value: "all", label: "ทุกประเภท" },
  { value: "small", label: "ห้องประชุมเล็ก (≤ 10 คน)" },
  { value: "medium", label: "ห้องประชุมกลาง (11-25 คน)" },
  { value: "large", label: "ห้องประชุมใหญ่ (26-60 คน)" },
  { value: "conference", label: "ห้องประชุมใหญ่ (> 60 คน)" },
  { value: "board", label: "ห้องประชุมบอร์ด" },
];
