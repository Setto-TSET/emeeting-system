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
};

export const meetingRooms: Room[] = [
  { id: "R-A101", name: "ห้องประชุม A-101", category: "small", categoryLabel: "ห้องประชุมเล็ก", capacity: 8, location: "อาคาร A", floor: "ชั้น 1", amenities: ["โปรเจกเตอร์", "TV 65\"", "Whiteboard"], status: "available" },
  { id: "R-A201", name: "ห้องประชุม A-201", category: "medium", categoryLabel: "ห้องประชุมกลาง", capacity: 16, location: "อาคาร A", floor: "ชั้น 2", amenities: ["โปรเจกเตอร์", "ระบบประชุมทางไกล", "ไมโครโฟน"], status: "available" },
  { id: "R-A301", name: "ห้องประชุม A-301", category: "large", categoryLabel: "ห้องประชุมใหญ่", capacity: 40, location: "อาคาร A", floor: "ชั้น 3", amenities: ["โปรเจกเตอร์ 2 ตัว", "ระบบเสียง Wireless", "Video Conference", "เวที"], status: "available" },
  { id: "R-B201", name: "ห้องประชุมบอร์ด B-201", category: "board", categoryLabel: "ห้องบอร์ดผู้บริหาร", capacity: 20, location: "อาคาร B", floor: "ชั้น 2", amenities: ["โต๊ะขนาดใหญ่", "TV ทัชสกรีน", "Video Conference"], status: "occupied" },
  { id: "R-B301", name: "ห้องประชุมใหญ่ B-301", category: "conference", categoryLabel: "ห้องประชุมใหญ่", capacity: 120, location: "อาคาร B", floor: "ชั้น 3", amenities: ["โปรเจกเตอร์ 3 ตัว", "ระบบแปลภาษา", "Live Streaming", "ห้องแต่งตัว"], status: "available" },
  { id: "R-C102", name: "ห้องประชุม C-102", category: "small", categoryLabel: "ห้องประชุมเล็ก", capacity: 6, location: "อาคาร C", floor: "ชั้น 1", amenities: ["TV 55\"", "Whiteboard"], status: "available" },
  { id: "R-C202", name: "ห้องประชุม C-202", category: "medium", categoryLabel: "ห้องประชุมกลาง", capacity: 20, location: "อาคาร C", floor: "ชั้น 2", amenities: ["โปรเจกเตอร์", "ระบบเสียง"], status: "maintenance" },
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

export const bookings: Booking[] = [
  { id: "BK-2569-001", roomId: "R-A101", roomName: "ห้องประชุม A-101", title: "ประชุมทีมพัฒนาผลิตภัณฑ์", bookedById: "U-001", bookedBy: "นาย สมชาย ใจดี", department: "สำนักบริหาร", date: "2026-07-15", startTime: "09:00", endTime: "12:00", attendees: 6, purpose: "ประชุมประจำสัปดาห์", status: "confirmed" },
  { id: "BK-2569-002", roomId: "R-A301", roomName: "ห้องประชุม A-301", title: "ประชุมคณะกรรมการบริหาร ครั้งที่ 7/2569", bookedById: "U-003", bookedBy: "นางสาว มาลี รักษาสัตย์", department: "สำนักผู้บริหาร", date: "2026-07-15", startTime: "13:00", endTime: "16:30", attendees: 35, purpose: "ประชุมประจำเดือน", status: "confirmed" },
  { id: "BK-2569-003", roomId: "R-B201", roomName: "ห้องประชุมบอร์ด B-201", title: "ประชุมพิจารณางบประมาณ", bookedById: "U-001", bookedBy: "นาย สมชาย ใจดี", department: "สำนักบริหาร", date: "2026-07-16", startTime: "10:00", endTime: "12:00", attendees: 12, purpose: "อนุมัติงบประมาณ Q3", status: "confirmed" },
  { id: "BK-2569-004", roomId: "R-A201", roomName: "ห้องประชุม A-201", title: "อบรมภายใน — Excel Advanced", bookedById: "U-004", bookedBy: "นางสาว วิภา สุขใจ", department: "ฝ่ายทรัพยากรบุคคล", date: "2026-07-17", startTime: "09:00", endTime: "16:00", attendees: 15, purpose: "อบรมพัฒนาบุคลากร", status: "pending" },
  { id: "BK-2569-005", roomId: "R-B301", roomName: "ห้องประชุมใหญ่ B-301", title: "ประชุมใหญ่สามัญประจำปี", bookedById: "U-002", bookedBy: "นาย ประเสริฐ มั่นคง", department: "สำนักผู้บริหาร", date: "2026-07-20", startTime: "09:00", endTime: "17:00", attendees: 100, purpose: "AGM 2569", status: "confirmed" },
  { id: "BK-2569-006", roomId: "R-A101", roomName: "ห้องประชุม A-101", title: "สัมภาษณ์งาน", bookedById: "U-004", bookedBy: "นางสาว วิภา สุขใจ", department: "ฝ่ายทรัพยากรบุคคล", date: "2026-07-14", startTime: "14:00", endTime: "16:00", attendees: 4, purpose: "สัมภาษณ์ตำแหน่ง Developer", status: "confirmed" },
];

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
   * กุญแจห้องประชุมที่เดาไม่ได้ — สำหรับเครื่องยนต์ที่ฝังในเว็บ (Webex/Jitsi)
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
};

export type MeetingChatMessage = {
  id: string;
  sender: string;
  text: string;
  time: string;
};

export const meetings: Meeting[] = [
  {
    id: "MT-2569-007",
    name: "การประชุมคณะกรรมการบริหาร ครั้งที่ 7/2569",
    shortName: "กก.บริหาร 7/69",
    type: "การประชุมคณะกรรมการ",
    committeeId: "COM-01",
    committee: "คณะกรรมการบริหาร",
    organizerId: "U-003",
    organizer: "นางสาว มาลี รักษาสัตย์",
    organizerEmail: "malee.r@e-office.cloud",
    emailSenderName: "สำนักผู้บริหาร",
    date: "2026-07-15",
    startTime: "13:00",
    endTime: "16:30",
    location: "ห้องประชุม A-301",
    // ตัวอย่างการประชุมผ่าน Microsoft Teams — ระบบตรวจผู้ให้บริการจากลิงก์เอง
    conferenceLink: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_exec072569%40thread.v2/0",
    status: "notified",
    displayFormat: 2,
    participants: [
      { id: "P-01", name: "นาย ประเสริฐ มั่นคง", position: "ประธาน", role: "ผู้อำนวยการ", department: "สำนักผู้บริหาร", userId: "U-002", email: "prasert@e-office.cloud", attendance: "attend", inSystem: true },
      { id: "P-02", name: "นางสาว มาลี รักษาสัตย์", position: "เลขานุการ", role: "หัวหน้าฝ่ายเลขา", department: "สำนักผู้บริหาร", userId: "U-003", email: "malee.r@e-office.cloud", attendance: "attend", inSystem: true },
      { id: "P-03", name: "นาย สมชาย ใจดี", position: "กรรมการ", role: "เจ้าหน้าที่บริหารงานทั่วไป", department: "สำนักบริหาร", userId: "U-001", email: "somchai.j@e-office.cloud", attendance: "attend", inSystem: true },
      { id: "P-04", name: "นาง วิภา สุขใจ", position: "กรรมการ", role: "หัวหน้าฝ่ายบุคคล", department: "ฝ่ายทรัพยากรบุคคล", userId: "U-004", email: "wipha.s@e-office.cloud", attendance: "representative", inSystem: true },
      { id: "P-05", name: "นาย ที่ปรึกษา ผู้ทรงคุณวุฒิ", position: "ที่ปรึกษา", role: "ผู้ทรงคุณวุฒิภายนอก", department: "-", userId: null, email: "-", inSystem: false, attendance: "pending" },
    ],
    files: [
      { id: "F-01", name: "ระเบียบวาระการประชุม 7/2569.pdf", description: "ระเบียบวาระประชุมฉบับสมบูรณ์", size: "845 KB", uploadedAt: "2026-07-10", uploadedBy: "นางสาว มาลี รักษาสัตย์", type: "regulation", visibility: "participants" },
      { id: "F-02", name: "งบการเงินไตรมาส 2.xlsx", description: "รายละเอียดงบการเงิน (เฉพาะประธาน/เลขา)", size: "212 KB", uploadedAt: "2026-07-11", uploadedBy: "นาง วิภา สุขใจ", type: "attachment", visibility: "restricted", allowedPositions: ["ประธาน", "เลขานุการ"] },
      { id: "F-03", name: "ประกาศแจ้งเวียน — วาระการประชุมประจำเดือน.pdf", description: "ประกาศทั่วไปสำหรับพนักงานทุกท่าน", size: "95 KB", uploadedAt: "2026-07-08", uploadedBy: "นางสาว มาลี รักษาสัตย์", type: "attachment", visibility: "public" },
      { id: "F-04", name: "โครงสร้างองค์กรใหม่ (ลับ).pdf", description: "ร่างโครงสร้างองค์กร — ห้ามเผยแพร่", size: "1.4 MB", uploadedAt: "2026-07-12", uploadedBy: "นาย ประเสริฐ มั่นคง", type: "attachment", visibility: "restricted", allowedUserIds: ["U-002", "U-003"] },
    ],
    agenda: [
      { id: "A-1", no: "1", title: "เรื่องประธานแจ้งให้ที่ประชุมทราบ", detail: "รายงานสถานการณ์องค์กรและทิศทางการดำเนินงานในไตรมาสหน้า", comments: [] },
      { id: "A-2", no: "2", title: "รับรองรายงานการประชุมครั้งที่แล้ว", detail: "รับรองรายงานการประชุมครั้งที่ 6/2569", comments: [] },
      { id: "A-3", no: "3", title: "เรื่องเพื่อพิจารณา", comments: [] },
      { id: "A-3-1", no: "3.1", title: "พิจารณาอนุมัติงบประมาณ Q3", detail: "งบประมาณสำหรับไตรมาส 3 ปีงบประมาณ 2569 จำนวน 12,500,000 บาท", comments: [{ by: "นาย สมชาย ใจดี", text: "เสนอปรับลดงบสำรอง 5%", time: "14:22" }] },
      { id: "A-3-2", no: "3.2", title: "พิจารณาปรับผังองค์กร", detail: "ข้อเสนอปรับโครงสร้างองค์กรใหม่", secretGroupId: "SG-01", comments: [] },
      { id: "A-4", no: "4", title: "เรื่องอื่นๆ", comments: [] },
    ],
    secretGroups: [
      { id: "SG-01", name: "กลุ่มลับ — เรื่องบุคคล", participantIds: ["P-01", "P-02"] },
    ],
    permissions: [
      { userId: "U-003", name: "นางสาว มาลี รักษาสัตย์", type: "manager" },
      { userId: "U-002", name: "นาย ประเสริฐ มั่นคง", type: "manager" },
      { userId: "U-001", name: "นาย สมชาย ใจดี", type: "reader" },
      { userId: "U-004", name: "นาง วิภา สุขใจ", type: "reader" },
    ],
    extraTextBoxes: [
      { id: "TB-1", name: "มติที่ประชุม" },
      { id: "TB-2", name: "ข้อสั่งการ" },
    ],
    savedToDrive: true,
    createdAt: "2026-07-08",
  },
  {
    id: "MT-2569-008",
    name: "การประชุมทีมพัฒนาผลิตภัณฑ์",
    shortName: "ทีมพัฒนา 8/69",
    type: "การประชุมภายในทีม",
    committeeId: "COM-02",
    committee: "ทีมพัฒนาผลิตภัณฑ์",
    organizerId: "U-001",
    organizer: "นาย สมชาย ใจดี",
    organizerEmail: "somchai.j@e-office.cloud",
    emailSenderName: "e-office",
    date: "2026-07-15",
    startTime: "09:00",
    endTime: "12:00",
    location: "ห้องประชุม A-101",
    // ตัวอย่างประชุมที่ใช้ Webex ฝังในเว็บ + AI สรุปให้ (mock — ยังไม่มี license จริง)
    conferenceProvider: "webex",
    conferenceRoomKey: "emeeting-demo-webex-mt008",
    transcriptStatus: "none",
    allowGuestJoin: true,
    status: "in_progress",
    displayFormat: 1,
    participants: [
      { id: "P-11", name: "นาย สมชาย ใจดี", position: "ประธาน", role: "PM", department: "สำนักบริหาร", userId: "U-001", email: "somchai.j@e-office.cloud", attendance: "attend", present: true, inSystem: true },
      { id: "P-12", name: "นาย เดชา เก่งจริง", position: "กรรมการ", role: "Tech Lead", department: "ฝ่ายเทคโนโลยี", userId: "U-005", email: "decha@e-office.cloud", attendance: "attend", present: true, inSystem: true },
      { id: "P-13", name: "นางสาว ณิชา งามพร้อม", position: "กรรมการ", role: "UX Designer", department: "ฝ่ายออกแบบ", userId: null, email: "nicha@e-office.cloud", attendance: "attend", present: false, inSystem: true },
      { id: "P-14", name: "นาย ภูมิ อาสา", position: "เลขานุการ", role: "Business Analyst", department: "สำนักบริหาร", userId: null, email: "phum@e-office.cloud", attendance: "attend", present: true, inSystem: true },
    ],
    files: [
      { id: "F-08-1", name: "Sprint Review Notes.pdf", description: "สรุปการทบทวน Sprint ที่แล้ว", size: "142 KB", uploadedAt: "2026-07-14", uploadedBy: "นาย สมชาย ใจดี", type: "attachment", visibility: "committee" },
    ],
    agenda: [
      { id: "B-1", no: "1", title: "รายงานความคืบหน้า Sprint ที่แล้ว", comments: [] },
      { id: "B-2", no: "2", title: "วางแผน Sprint ถัดไป", comments: [] },
      { id: "B-3", no: "3", title: "เรื่องอื่นๆ", comments: [] },
    ],
    secretGroups: [],
    permissions: [
      { userId: "U-001", name: "นาย สมชาย ใจดี", type: "manager" },
    ],
    savedToDrive: false,
    createdAt: "2026-07-10",
  },
  {
    id: "MT-2569-006",
    name: "การประชุมคณะกรรมการบริหาร ครั้งที่ 6/2569",
    shortName: "กก.บริหาร 6/69",
    type: "การประชุมคณะกรรมการ",
    committeeId: "COM-01",
    committee: "คณะกรรมการบริหาร",
    organizerId: "U-003",
    organizer: "นางสาว มาลี รักษาสัตย์",
    organizerEmail: "malee.r@e-office.cloud",
    emailSenderName: "สำนักผู้บริหาร",
    date: "2026-06-15",
    startTime: "13:00",
    endTime: "16:30",
    location: "ห้องประชุม A-301",
    status: "endorsed",
    displayFormat: 2,
    participants: [
      { id: "P-01", name: "นาย ประเสริฐ มั่นคง", position: "ประธาน", role: "ผู้อำนวยการ", department: "สำนักผู้บริหาร", userId: "U-002", email: "prasert@e-office.cloud", attendance: "attend", present: true, inSystem: true },
      { id: "P-02", name: "นางสาว มาลี รักษาสัตย์", position: "เลขานุการ", role: "หัวหน้าฝ่ายเลขา", department: "สำนักผู้บริหาร", userId: "U-003", email: "malee.r@e-office.cloud", attendance: "attend", present: true, inSystem: true },
    ],
    files: [
      { id: "FR-1", name: "รายงานการประชุม 6-2569.docx", description: "รายงานการประชุมฉบับสมบูรณ์", size: "1.2 MB", uploadedAt: "2026-06-20", uploadedBy: "นางสาว มาลี รักษาสัตย์", type: "report_final", visibility: "committee" },
      { id: "FR-2", name: "สรุปมติที่ประชุม 6-2569.pdf", description: "สรุปมติเพื่อเผยแพร่ทั่วไป", size: "180 KB", uploadedAt: "2026-06-21", uploadedBy: "นางสาว มาลี รักษาสัตย์", type: "report_final", visibility: "public" },
    ],
    agenda: [],
    secretGroups: [],
    permissions: [],
    savedToDrive: true,
    createdAt: "2026-06-08",
  },
  {
    id: "MT-2569-009",
    name: "ประชุมคณะทำงาน — พัฒนาระบบ e-Office",
    shortName: "คณะทำงาน e-Office",
    type: "การประชุมคณะทำงาน",
    committeeId: "COM-03",
    committee: "คณะทำงานพัฒนา e-Office",
    organizerId: "U-005",
    organizer: "นาย เดชา เก่งจริง",
    organizerEmail: "decha@e-office.cloud",
    emailSenderName: "ฝ่ายเทคโนโลยี",
    date: "2026-07-22",
    startTime: "10:00",
    endTime: "12:00",
    location: "ห้องประชุม A-201",
    // ตัวอย่างการประชุมผ่าน Zoom — ระบบดึงรหัสห้อง/รหัสผ่านจากลิงก์มาแสดงให้ผู้เข้าร่วม
    conferenceLink: "https://us02web.zoom.us/j/84123456789?pwd=eOffice2569",
    status: "prepare",
    displayFormat: 1,
    // ยังไม่มีองค์ประชุม — ระบบจะบังคับให้จัดการรายชื่อก่อนเมื่อเข้ากล่องประชุมครั้งแรก
    participants: [],
    files: [],
    agenda: [
      { id: "C-1", no: "1", title: "ทบทวนขอบเขตงานเฟส 2", comments: [] },
    ],
    secretGroups: [],
    permissions: [{ userId: "U-005", name: "นาย เดชา เก่งจริง", type: "manager" }],
    savedToDrive: false,
    createdAt: "2026-07-12",
  },
  {
    id: "MT-2569-005",
    name: "การประชุมคณะทำงาน — ความปลอดภัยข้อมูล ครั้งที่ 3/2569",
    shortName: "Security 3/69",
    type: "การประชุมคณะทำงาน",
    committeeId: "COM-04",
    committee: "คณะทำงานความปลอดภัยข้อมูล",
    organizerId: null,
    organizer: "นาย ภูมิ อาสา",
    organizerEmail: "phum@e-office.cloud",
    emailSenderName: "e-office",
    date: "2026-06-30",
    startTime: "14:00",
    endTime: "16:00",
    location: "ห้องประชุม B-201",
    status: "waiting_endorse",
    displayFormat: 3,
    participants: [
      { id: "P-14", name: "นาย ภูมิ อาสา", position: "ประธาน", role: "Business Analyst", department: "สำนักบริหาร", userId: null, email: "phum@e-office.cloud", inSystem: true, present: true },
    ],
    files: [
      { id: "FD-1", name: "ร่างรายงาน Security 3-2569.docx", description: "ร่างรายงานการประชุมจากระบบ (ยังไม่รับรอง)", size: "540 KB", uploadedAt: "2026-07-01", uploadedBy: "ระบบอัตโนมัติ", type: "report_draft", visibility: "committee" },
      { id: "FD-2", name: "รายการช่องโหว่ที่พบ.xlsx", description: "รายการช่องโหว่ (ลับ)", size: "88 KB", uploadedAt: "2026-06-30", uploadedBy: "นาย ภูมิ อาสา", type: "attachment", visibility: "restricted", allowedPositions: ["ประธาน"] },
    ],
    agenda: [],
    secretGroups: [],
    permissions: [],
    savedToDrive: true,
    createdAt: "2026-06-20",
  },
];

// ===== Committees =====
export const committees = [
  { id: "COM-01", name: "คณะกรรมการบริหาร", meetingsCount: 7, members: 12 },
  { id: "COM-02", name: "ทีมพัฒนาผลิตภัณฑ์", meetingsCount: 12, members: 6 },
  { id: "COM-03", name: "คณะทำงานพัฒนา e-Office", meetingsCount: 4, members: 8 },
  { id: "COM-04", name: "คณะทำงานความปลอดภัยข้อมูล", meetingsCount: 3, members: 5 },
  { id: "COM-05", name: "คณะกรรมการตรวจสอบภายใน", meetingsCount: 5, members: 7 },
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
