// ═══════════════════════════════════════════
// Mock Transcription Provider
// สร้าง transcript จำลองภาษาไทยจาก meeting data ที่มีอยู่
// ถ้าต้องการความแม่นยำสูงขึ้นกว่า Web Speech API — สร้าง assemblyai.ts / azure.ts แทนไฟล์นี้
// เปลี่ยน import ใน UI จาก mockTranscriptionProvider → assemblyaiProvider/azureProvider
// ═══════════════════════════════════════════

import type { TranscriptionProvider, MeetingTranscript, TranscriptSegment } from "./types";
import type { Meeting } from "@/data";

// คลังประโยคจำลองสำหรับ mock — ออกแบบให้อ่านแล้วเชื่อว่าเป็น transcript ประชุมจริง
const agendaOpenings = [
  "ท่านประธานครับ ขอเรียนว่าวาระนี้",
  "ขอรายงานที่ประชุมว่า",
  "ตามที่ได้นำเสนอในวาระที่ผ่านมา",
  "ขอให้ที่ประชุมพิจารณา",
];
const discussions = [
  "คณะทำงานได้พิจารณาแล้วเห็นว่ามีความเหมาะสม",
  "มีผู้เสนอให้ปรับแก้ในส่วนของงบประมาณ",
  "ที่ประชุมอภิปรายถึงความเป็นไปได้และผลกระทบ",
  "ฝ่ายเลขานุการได้ชี้แจงรายละเอียดเพิ่มเติม",
  "มีการซักถามเพิ่มเติมในประเด็นระยะเวลาดำเนินการ",
  "ผู้แทนฝ่ายงบประมาณได้ชี้แจงว่าสามารถดำเนินการได้",
];
const resolutions = [
  "ที่ประชุมมีมติเห็นชอบตามที่เสนอ",
  "ให้ดำเนินการตามแผนที่กำหนด",
  "รับทราบและให้ฝ่ายเลขาฯ ดำเนินการต่อ",
  "เห็นชอบในหลักการ พร้อมมอบหมายฝ่ายที่เกี่ยวข้องดำเนินการ",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateMockTranscript(meeting: Meeting): MeetingTranscript {
  const speakers = meeting.participants.filter(p => p.inSystem && p.userId !== null);
  if (speakers.length === 0) {
    // fallback: ถ้าไม่มีผู้เข้าร่วมในระบบ ใช้ placeholder
    speakers.push({ id: "sys-1", userId: "sys-1", name: "ประธานที่ประชุม", position: "ประธาน", role: "ประธาน", department: "", email: "", inSystem: true });
  }

  const segments: TranscriptSegment[] = [];
  let cursor = 0; // วินาทีสะสม

  // เปิดประชุม
  segments.push({
    speakerId: speakers[0].userId,
    speakerName: speakers[0].name,
    startSec: cursor,
    endSec: cursor + 45,
    text: `ขอเปิดการประชุม${meeting.name} บัดนี้มีองค์ประชุมครบถ้วนแล้ว ขอเชิญเลขานุการแจ้งระเบียบวาระ`,
  });
  cursor += 60;

  // สร้าง segment ต่อวาระ
  for (const ag of meeting.agenda) {
    const agStart = cursor;
    // เปิดวาระ
    segments.push({
      speakerId: speakers[0].userId,
      speakerName: speakers[0].name,
      startSec: cursor,
      endSec: cursor + 30,
      text: `${pick(agendaOpenings)} "${ag.title}" ขอเชิญผู้รับผิดชอบนำเสนอ`,
    });
    cursor += 35;

    // อภิปราย 3-5 ช่วง
    const rounds = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < rounds; i++) {
      const spk = speakers[i % speakers.length];
      segments.push({
        speakerId: spk.userId,
        speakerName: spk.name,
        startSec: cursor,
        endSec: cursor + 20 + Math.floor(Math.random() * 40),
        text: pick(discussions),
      });
      cursor += 30 + Math.floor(Math.random() * 30);
    }

    // มติ
    segments.push({
      speakerId: speakers[0].userId,
      speakerName: speakers[0].name,
      startSec: cursor,
      endSec: cursor + 20,
      text: `${pick(resolutions)} ผ่านไปยังวาระถัดไป`,
    });
    cursor += 30;

    // เก็บ agendaWindow ไว้ใน segment แรกของวาระ (ใช้โดย summarizer)
    // NOTE: agendaWindow จริงมาจาก activeAgendaId history ที่โฮสต์กดในห้องประชุม
    //       ตอนนี้คำนวณแบบ sequential แทน
    void agStart; // suppress unused var
  }

  // ปิดประชุม
  segments.push({
    speakerId: speakers[0].userId,
    speakerName: speakers[0].name,
    startSec: cursor,
    endSec: cursor + 30,
    text: "ขอขอบคุณทุกท่านที่เข้าร่วมประชุม บัดนี้ครบทุกวาระแล้ว ขอปิดการประชุม",
  });

  return { meetingId: meeting.id, status: "ready", language: "th", segments };
}

export const mockTranscriptionProvider: TranscriptionProvider = {
  id: "mock",
  async getTranscript(meetingId: string): Promise<MeetingTranscript> {
    // จำลอง network delay
    await new Promise(r => setTimeout(r, 1500));
    // NOTE: provider จริงจะรับแค่ meetingId แล้วดึงจาก API
    // ตอนนี้ต้อง pass meeting object เข้ามาทาง wrapper — ดู UI ใน meetings/[id]/page.tsx
    return {
      meetingId,
      status: "ready",
      language: "th",
      segments: [], // จะถูก replace ด้วย generateMockTranscript ใน UI
    };
  },
};
