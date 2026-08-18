// ═══════════════════════════════════════════
// Claude Summarize — logic ล้วนของการสรุปประชุมด้วย Claude API
// เรียก Claude Messages API ตรงผ่าน fetch (ไม่ใช้ @anthropic-ai/sdk — โปรเจกต์นี้ไม่มี SDK
// ผู้ให้บริการอื่นติดตั้งอยู่แล้ว เรียก REST ตรงตามแพทเทิร์นเดียวกับ zegoAsr.ts)
// ═══════════════════════════════════════════

import type { TranscriptSegment } from "@/services/transcription/types";
import type { AgendaWindow, AgendaSummary } from "@/services/summarize/types";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-5";

export function segmentsInWindow(
  segments: TranscriptSegment[],
  window: AgendaWindow
): TranscriptSegment[] {
  return segments.filter((s) => s.startSec >= window.startSec && s.endSec <= window.endSec);
}

export function transcriptToText(segments: TranscriptSegment[]): string {
  return segments.map((s) => `[${s.speakerName}] ${s.text}`).join("\n");
}

export function buildOverallPrompt(transcriptText: string): string {
  return (
    "คุณคือเลขานุการช่วยสรุปประชุมภาษาไทย สรุปบทสนทนาทั้งหมดต่อไปนี้เป็นย่อหน้าเดียว กระชับ ใจความครบ " +
    "ตอบเป็นข้อความล้วน ไม่ต้องมี JSON หรือ markdown:\n\n" +
    transcriptText
  );
}

export function buildAgendaPrompt(transcriptText: string): string {
  return [
    "คุณคือเลขานุการช่วยสรุปประชุมภาษาไทย สรุปบทสนทนาต่อไปนี้เป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON:",
    '{"discussion": string, "resolutions": string[], "actionItems": [{"text": string, "ownerName"?: string}]}',
    "บทสนทนา:",
    transcriptText,
  ].join("\n\n");
}

export function parseAgendaJson(agendaId: string, raw: string): AgendaSummary {
  const cleaned = raw.trim().replace(/^```json\s*|\s*```$/g, "");
  const parsed = JSON.parse(cleaned) as {
    discussion?: unknown;
    resolutions?: unknown;
    actionItems?: unknown;
  };
  return {
    agendaId,
    discussion: String(parsed.discussion ?? ""),
    resolutions: Array.isArray(parsed.resolutions) ? parsed.resolutions.map(String) : [],
    actionItems: Array.isArray(parsed.actionItems)
      ? parsed.actionItems.map((a) => {
          const item = a as { text?: unknown; ownerName?: unknown };
          return {
            text: String(item.text ?? ""),
            ownerName: item.ownerName ? String(item.ownerName) : undefined,
          };
        })
      : [],
  };
}

export async function callClaude(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API HTTP ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = json.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Claude API ตอบกลับไม่มี content[0].text");
  }
  return text;
}
