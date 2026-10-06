// ═══════════════════════════════════════════
// Claude Service — Meeting Summarization
// ═══════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import type { TranscriptSegment } from '../repositories/transcript';

// รับได้ทั้งสองชื่อ — compose/koyeb ใช้ ANTHROPIC_API_KEY, dev เดิมใช้ CLAUDE_API_KEY
const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;

const client = new Anthropic({ apiKey });

export type Agenda = { id: string; no: string; title: string };

export type AgendaSummary = {
  agendaId: string;
  discussion: string;
  resolutions: string[];
  actionItems: { text: string; ownerName?: string }[];
};

export type SummaryResult = { byAgenda: AgendaSummary[]; overall: string };

/** ไม่มี key = ฟีเจอร์ปิดอยู่ ไม่ใช่ความผิดพลาดของ server — route แปลงเป็น 503 */
export class SummarizerUnavailableError extends Error {}

export function isSummarizerConfigured(): boolean {
  return Boolean(apiKey);
}

// structured output บังคับให้ตอบตรง schema นี้เสมอ ไม่ต้องใช้ regex แกะ JSON จากข้อความอีก
const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    byAgenda: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          agendaId: { type: 'string' },
          discussion: { type: 'string' },
          resolutions: { type: 'array', items: { type: 'string' } },
          actionItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: { text: { type: 'string' }, ownerName: { type: 'string' } },
              required: ['text'],
              additionalProperties: false,
            },
          },
        },
        required: ['agendaId', 'discussion', 'resolutions', 'actionItems'],
        additionalProperties: false,
      },
    },
    overall: { type: 'string' },
  },
  required: ['byAgenda', 'overall'],
  additionalProperties: false,
};

/**
 * สรุปการประชุมโดยใช้ Claude API — ผลเป็นร่างเสมอ เลขาฯ ต้องตรวจและรับรองเอง
 */
export async function summarizeTranscript(
  transcript: TranscriptSegment[],
  agendas: Agenda[] = []
): Promise<SummaryResult> {
  if (!apiKey) {
    throw new SummarizerUnavailableError('ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY');
  }

  const message = await client.beta.messages.create({
    model: 'claude-sonnet-5-5',
    // ประชุมหลายวาระสรุปเป็นภาษาไทยกิน token มาก 2048 เดิมตัดกลางทางได้ — JSON ขาดแล้ว parse ไม่ได้
    max_tokens: 16000,
    // ถ้าตัวกรองความปลอดภัยของโมเดลปฏิเสธ ให้ API ส่งต่อไปโมเดลสำรองเองแทนที่จะคืน refusal มา
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { format: { type: 'json_schema', schema: SUMMARY_SCHEMA } },
    messages: [{ role: 'user', content: buildSummarizePrompt(transcript, agendas) }],
  });

  if (message.stop_reason === 'refusal') {
    throw new Error('โมเดลปฏิเสธการสรุปการประชุมนี้');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('สรุปยาวเกินขีดจำกัด — ผลถูกตัดกลางทาง');
  }

  const text = message.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('ไม่ได้รับผลสรุปจากโมเดล');
  return JSON.parse(text.text) as SummaryResult;
}

function buildSummarizePrompt(transcript: TranscriptSegment[], agendas: Agenda[]): string {
  const transcriptText = transcript
    .map((s) => `[${formatTime(s.startSec)}] ${s.speakerName}: ${s.text}`)
    .join('\n');

  // ต้องส่งรหัสวาระไปด้วย ไม่งั้นโมเดลเดา agendaId เองแล้วรายงานจับคู่สรุปกับวาระไม่ได้
  const agendasText =
    agendas.length > 0
      ? agendas.map((a) => `- [${a.id}] วาระที่ ${a.no}: ${a.title}`).join('\n')
      : 'ไม่มีระเบียบวาระ — ให้ byAgenda เป็น array ว่าง แล้วสรุปทั้งหมดไว้ใน overall';

  return `คุณเป็นผู้บันทึกรายงานการประชุมของหน่วยงานราชการไทย สรุปการประชุมด้านล่างเป็นภาษาไทยแบบทางการ

## ระเบียบวาระการประชุม (รหัสในวงเล็บเหลี่ยมคือ agendaId)
${agendasText}

## บันทึกคำพูด (ถอดเสียงอัตโนมัติ อาจสะกดผิดบ้าง โดยเฉพาะชื่อคนและศัพท์เฉพาะ)
${transcriptText}

## วิธีสรุป
- byAgenda: หนึ่งรายการต่อวาระที่มีการพูดถึงจริง ใช้ agendaId ตามรหัสในวงเล็บเหลี่ยมเท่านั้น
- discussion: สรุปการอภิปราย 2-3 ประโยค
- resolutions: มติที่ประชุมตามที่พูดจริง ถ้าไม่มีมติให้เป็น array ว่าง
- actionItems: ข้อสั่งการ ใส่ ownerName เฉพาะเมื่อมีการระบุผู้รับผิดชอบชัดเจน
- overall: สรุปภาพรวมทั้งการประชุม
- อ้างอิงจากบันทึกคำพูดเท่านั้น ห้ามแต่งมติ ตัวเลข หรือชื่อผู้รับผิดชอบที่ไม่ได้พูดถึง`;
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
