// ═══════════════════════════════════════════
// Claude Service — Meeting Summarization
// ═══════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import type { TranscriptSegment } from '../repositories/transcript';

// รับได้ทั้งสองชื่อ — compose/koyeb ใช้ ANTHROPIC_API_KEY, dev เดิมใช้ CLAUDE_API_KEY
const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;

const client = new Anthropic({ apiKey });

/** ยังไม่ได้ตั้ง key — route แปลงเป็น 503 ให้หน้าเว็บบอกผู้ใช้ตรง ๆ แทน 500 กำกวม */
export class SummarizerNotConfiguredError extends Error {}

export type Agenda = { id: string; no: string; title: string };

export type SummaryResult = {
  byAgenda: {
    agendaId: string;
    discussion: string;
    resolutions: string[];
    actionItems: { text: string; ownerName?: string }[];
  }[];
  overall: string;
};

// structured outputs บังคับรูปแบบ JSON ที่ฝั่ง API — ไม่ต้องขุด JSON ออกจากข้อความเองแล้ว
const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['byAgenda', 'overall'],
  properties: {
    byAgenda: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['agendaId', 'discussion', 'resolutions', 'actionItems'],
        properties: {
          agendaId: { type: 'string' },
          discussion: { type: 'string' },
          resolutions: { type: 'array', items: { type: 'string' } },
          actionItems: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['text'],
              properties: {
                text: { type: 'string' },
                ownerName: { type: 'string' },
              },
            },
          },
        },
      },
    },
    overall: { type: 'string' },
  },
};

const SYSTEM_PROMPT = `คุณเป็นผู้บันทึกรายงานการประชุมภาษาไทยของหน่วยงานราชการ
สรุปจากคำบรรยายการประชุม (ถอดเสียงอัตโนมัติ อาจมีคำผิดหรือขาดช่วง) เป็นภาษาไทยแบบทางการ

- แยกสรุปตามวาระ ใช้ agendaId จากรายการวาระที่ให้เท่านั้น ถ้าไม่มีวาระ ให้ byAgenda เป็นรายการว่างแล้วสรุปทั้งหมดใน overall
- discussion: สรุปประเด็นอภิปราย 2-3 ประโยค
- resolutions: มติที่ประชุมที่มีการตกลงกันจริง ถ้าไม่มีมติให้เป็นรายการว่าง
- actionItems: งานที่มอบหมาย ใส่ ownerName เมื่อคำบรรยายระบุผู้รับผิดชอบชัดเจนเท่านั้น
- อ้างอิงจากคำบรรยายจริงเท่านั้น ห้ามเติมข้อมูลที่ไม่มีในคำบรรยาย
- ผลนี้เป็นร่าง เลขานุการจะตรวจแก้ก่อนรับรอง`;

/**
 * สรุปการประชุมโดยใช้ Claude API
 */
export async function summarizeTranscript(
  transcript: TranscriptSegment[],
  agendas: Agenda[] = []
): Promise<SummaryResult> {
  if (!apiKey) {
    throw new SummarizerNotConfiguredError('CLAUDE_API_KEY not configured');
  }

  const message = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // ถ้าโมเดลหลักปฏิเสธ (safety classifier) ให้ API ลองโมเดลสำรองให้เองในคำขอเดียวกัน
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: SUMMARY_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(transcript, agendas) }],
  });

  if (message.stop_reason === 'refusal') {
    throw new Error('Claude ปฏิเสธการสรุปประชุมนี้');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('ผลสรุปยาวเกินกำหนด — ถูกตัดกลางคัน');
  }

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude ไม่ได้คืนผลสรุป');
  }
  return JSON.parse(textBlock.text) as SummaryResult;
}

function buildUserPrompt(transcript: TranscriptSegment[], agendas: Agenda[]): string {
  const agendasText =
    agendas.length > 0
      ? agendas.map((a) => `- agendaId "${a.id}" — วาระที่ ${a.no}: ${a.title}`).join('\n')
      : 'ไม่มีระเบียบวาระ';

  const transcriptText = transcript
    .map((s) => `[${formatTime(s.startSec)}] ${s.speakerName}: ${s.text}`)
    .join('\n');

  return `## ระเบียบวาระการประชุม
${agendasText}

## คำบรรยายการประชุม
${transcriptText}`;
}

/**
 * Format seconds to HH:MM:SS
 */
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
