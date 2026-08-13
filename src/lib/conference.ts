// ═══════════════════════════════════════════
// Conference Provider Layer
// จุดเดียวที่รู้ว่าการประชุมออนไลน์วิ่งบนแพลตฟอร์มไหน
//
// ตอนนี้ระบบวิดีโอยังเป็น mockup (provider = "mock")
// แต่โครงนี้เตรียมไว้ให้สลับไป Teams / Zoom / Google Meet ได้
// โดยไม่ต้องแก้หน้าจอ — แค่ใส่ลิงก์เข้ามา ระบบจะตรวจเองว่าเป็นเจ้าไหน
// ═══════════════════════════════════════════

export type ConferenceProvider = "mock" | "teams" | "zoom" | "google_meet" | "zegocloud" | "other";

/**
 * วิธีพาผู้ใช้เข้าห้องประชุม
 * - simulated : ห้องประชุมจำลองในเว็บเรา (ของปัจจุบัน)
 * - external  : เปิดแอป/แท็บใหม่ของผู้ให้บริการ — เพราะ Teams/Zoom/Meet บล็อกการฝัง iframe
 * - embed     : ฝังในเว็บได้ (เช่น Jitsi) — ยังไม่ได้ใช้ เตรียมช่องไว้
 * - sdk       : ฝังผ่าน SDK ที่ต้องมี key + backend signature (เช่น Zoom Web SDK) — ยังไม่ได้ใช้
 */
export type ConferenceLaunchMode = "simulated" | "external" | "embed" | "sdk";

export type ConferenceProviderSpec = {
  id: ConferenceProvider;
  label: string;
  shortLabel: string;
  /** material symbol name */
  icon: string;
  /** tailwind classes สำหรับปุ่ม/แบรนด์ */
  brandClass: string;
  launchMode: ConferenceLaunchMode;
  /** โดเมนที่ใช้ตรวจว่าเป็นผู้ให้บริการเจ้านี้ */
  hostPatterns: string[];
  /** ข้อความบอกผู้ใช้ว่าจะเกิดอะไรขึ้นเมื่อกดเข้าประชุม */
  joinHint: string;
  /**
   * ฝัง iframe ในเว็บเราได้ไหม
   * Teams/Zoom/Meet ตั้ง X-Frame-Options / CSP frame-ancestors กันไว้ — ฝังไม่ได้
   */
  canEmbed: boolean;
};

export const conferenceProviders: Record<ConferenceProvider, ConferenceProviderSpec> = {
  mock: {
    id: "mock",
    label: "ห้องประชุมจำลองในระบบ (Mockup)",
    shortLabel: "ระบบภายใน",
    icon: "videocam",
    brandClass: "bg-rose-600 hover:bg-rose-700",
    launchMode: "simulated",
    hostPatterns: ["meet.e-office.cloud"],
    joinHint: "เข้าห้องประชุมจำลองภายในเว็บนี้",
    canEmbed: true,
  },
  teams: {
    id: "teams",
    label: "Microsoft Teams",
    shortLabel: "Teams",
    icon: "groups",
    brandClass: "bg-[#4b53bc] hover:bg-[#3d44a0]",
    launchMode: "external",
    hostPatterns: ["teams.microsoft.com", "teams.live.com"],
    joinHint: "ระบบจะเปิด Microsoft Teams ให้อัตโนมัติ",
    canEmbed: false,
  },
  zoom: {
    id: "zoom",
    label: "Zoom Meeting",
    shortLabel: "Zoom",
    icon: "videocam",
    brandClass: "bg-[#0b5cff] hover:bg-[#0a4ed6]",
    launchMode: "external",
    hostPatterns: ["zoom.us", "zoom.com"],
    joinHint: "ระบบจะเปิด Zoom ให้อัตโนมัติ",
    canEmbed: false,
  },
  google_meet: {
    id: "google_meet",
    label: "Google Meet",
    shortLabel: "Google Meet",
    icon: "duo",
    brandClass: "bg-[#00832d] hover:bg-[#006d26]",
    launchMode: "external",
    hostPatterns: ["meet.google.com"],
    joinHint: "ระบบจะเปิด Google Meet ให้อัตโนมัติ",
    canEmbed: false,
  },
  zegocloud: {
    id: "zegocloud",
    label: "ZegoCloud Video (ระบบประชุมในเว็บ)",
    shortLabel: "ZegoCloud",
    icon: "videocam",
    brandClass: "bg-[#0055FF] hover:bg-[#0044CC]",
    launchMode: "sdk",
    hostPatterns: [],
    joinHint: "เข้าห้องประชุมผ่าน ZegoCloud ภายในหน้านี้",
    canEmbed: true,
  },
  other: {
    id: "other",
    label: "ผู้ให้บริการอื่น",
    shortLabel: "ลิงก์ภายนอก",
    icon: "link",
    brandClass: "bg-slate-700 hover:bg-slate-600",
    launchMode: "external",
    hostPatterns: [],
    joinHint: "ระบบจะเปิดลิงก์ประชุมในแท็บใหม่",
    canEmbed: false,
  },
};

/**
 * สร้างกุญแจห้องประชุมที่เดาไม่ได้ สำหรับเครื่องยนต์ที่ฝังในเว็บ
 * ห้ามใช้ meeting.id เป็นชื่อห้อง ไม่งั้นใครเดา id ได้ก็เข้าห้องลับได้
 */
export function newConferenceRoomKey(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `emeeting-${rand}`;
}

/** ตรวจว่าลิงก์ที่ผู้จัดวางมาเป็นของเจ้าไหน */
export function detectProvider(url?: string | null): ConferenceProvider {
  if (!url?.trim()) return "mock";

  let host: string;
  try {
    host = new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return "other";
  }

  for (const spec of Object.values(conferenceProviders)) {
    if (spec.hostPatterns.some((p) => host === p || host.endsWith(`.${p}`))) {
      return spec.id;
    }
  }
  return "other";
}

/** ดึงรหัสห้อง/รหัสผ่านออกจากลิงก์ เพื่อโชว์ให้ผู้เข้าร่วมกรอกเองได้ถ้าแอปไม่เปิด */
export function parseMeetingCode(
  provider: ConferenceProvider,
  url?: string | null
): { meetingId?: string; passcode?: string } {
  if (!url?.trim()) return {};

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return {};
  }

  if (provider === "zoom") {
    // https://us02web.zoom.us/j/8412345678?pwd=abc123
    const m = parsed.pathname.match(/\/j\/(\d+)/);
    return {
      meetingId: m?.[1],
      passcode: parsed.searchParams.get("pwd") ?? undefined,
    };
  }

  if (provider === "google_meet") {
    // https://meet.google.com/abc-defg-hij
    const code = parsed.pathname.replace(/^\//, "");
    return { meetingId: code || undefined };
  }

  // Teams ใช้ thread id ที่ยาวและไม่ได้ให้ผู้ใช้พิมพ์เอง — ไม่ต้องแยก
  return {};
}

export type ResolvedConference = {
  provider: ConferenceProvider;
  spec: ConferenceProviderSpec;
  url?: string;
  meetingId?: string;
  passcode?: string;
};

/**
 * จุดเดียวที่หน้าจอเรียกใช้ — บอกว่าการประชุมนี้ต้องเข้ายังไง
 * ถ้าผู้จัดระบุ provider มาแล้วก็ใช้ตามนั้น ถ้าไม่ระบุก็เดาจากลิงก์
 */
export function resolveConference(meeting: {
  conferenceLink?: string;
  conferenceProvider?: ConferenceProvider;
}): ResolvedConference {
  const provider = meeting.conferenceProvider ?? detectProvider(meeting.conferenceLink);
  const spec = conferenceProviders[provider] ?? conferenceProviders.other;
  const url = meeting.conferenceLink?.trim() || undefined;

  return { provider, spec, url, ...parseMeetingCode(provider, url) };
}
