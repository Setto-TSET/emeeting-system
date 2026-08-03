// ═══════════════════════════════════════════
// Claude Service — Meeting Summarization
// ═══════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

interface TranscriptSegment {
  speakerId: string;
  speakerName: string;
  startSec: number;
  endSec: number;
  text: string;
}

interface Agenda {
  agendaId: string;
  no: string;
  title: string;
}

interface SummaryResult {
  byAgenda: any[];
  overall: string;
}

/**
 * สรุปการประชุมโดยใช้ Claude API
 */
export async function summarizeTranscript(
  transcript: TranscriptSegment[],
  agendas: Agenda[] = []
): Promise<SummaryResult> {
  try {
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY not configured');
    }

    const prompt = buildSummarizePrompt(transcript, agendas);

    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const summary = parseClaudeSummary(responseText);

    return summary;
  } catch (error) {
    console.error('❌ Failed to summarize with Claude:', error);
    throw error;
  }
}

/**
 * สร้าง prompt สำหรับ Claude
 */
function buildSummarizePrompt(transcript: TranscriptSegment[], agendas: Agenda[]): string {
  const transcriptText = transcript
    .map(s => `[${formatTime(s.startSec)}] ${s.speakerName}: ${s.text}`)
    .join('\n');

  const agendasText = agendas.length > 0
    ? agendas.map(a => `- วาระที่ ${a.no}: ${a.title}`).join('\n')
    : 'ไม่มีรายระเบียบวาระ';

  return `
คุณเป็นผู้บันทึกประชุมมืออาชีพภาษาไทย

ให้สรุปการประชุมด้านล่างเป็นภาษาไทยอย่างเป็นทางการ

## ระเบียบวาระการประชุม
${agendasText}

## Transcript
${transcriptText}

## คำขอ

สรุปตามรูปแบบ JSON นี้:
\`\`\`json
{
  "byAgenda": [
    {
      "agendaId": "AG-1",
      "discussion": "สรุปการอภิปรายสั้นๆ (2-3 ประโยค)",
      "resolutions": ["มติ 1", "มติ 2"],
      "actionItems": [
        {
          "text": "ข้อสั่งการ + ผู้รับผิดชอบ",
          "ownerName": "ชื่อคน"
        }
      ]
    }
  ],
  "overall": "สรุปภาพรวมการประชุม"
}
\`\`\`

ข้อหลัก:
- ใช้ภาษาไทยอย่างเป็นทางการ
- Resolutions ต้องชัดเจน
- Action items ต้องระบุผู้รับผิดชอบและกำหนดเวลา
- ห้ามเดา — อ้างอิงจาก transcript จริง
`;
}

/**
 * Parse JSON response จาก Claude
 */
function parseClaudeSummary(responseText: string): SummaryResult {
  try {
    // หา JSON block ใน response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      byAgenda: parsed.byAgenda || [],
      overall: parsed.overall || ''
    };
  } catch (error) {
    console.error('❌ Failed to parse Claude summary:', error);
    throw error;
  }
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
