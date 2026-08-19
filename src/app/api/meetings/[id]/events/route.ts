// GET  /api/meetings/[id]/events — เปิดสตรีมรับสัญญาณในห้อง (Server-Sent Events)
// POST /api/meetings/[id]/events — ส่งสัญญาณให้ทุกคนในห้อง
//
// เดิมใช้ BroadcastChannel ซึ่งส่งได้แค่ระหว่างแท็บของเบราว์เซอร์เดียวกันบนเครื่องเดียวกัน
// — ยกมือ/ซับไตเติล/แชร์เอกสาร จึงไม่เคยข้ามเครื่องจริง
//
// ทำไม SSE ไม่ใช่ WebSocket: สัญญาณไหลทางเดียว (server → client) ส่วนขาส่งใช้ POST ธรรมดา
// SSE เป็น HTTP ปกติ ต่อผ่าน proxy ได้ และเบราว์เซอร์ต่อใหม่ให้เองเมื่อสายหลุด

import { z } from "zod";
import { requireAuth } from "@/lib/api/auth";
import { requireMeetingAccess } from "@/lib/api/meetingGuard";
import { withApi, readJson } from "@/lib/api/respond";
import { subscribe, publish } from "@/lib/api/events";

type Ctx = { params: Promise<{ id: string }> };

const HEARTBEAT_MS = 25_000;

export const GET = withApi(async (request: Request, ctx: Ctx) => {
  const { id: meetingId } = await ctx.params;
  // EventSource แนบ header เองไม่ได้ — เส้นนี้จึงพึ่ง session cookie เท่านั้น
  const user = await requireAuth(request);
  await requireMeetingAccess(user, meetingId, "meeting.view");

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));

      write(": connected\n\n");
      unsubscribe = subscribe(meetingId, (data) => write(`data: ${data}\n\n`));

      // คอมเมนต์เปล่าทุก 25 วินาที — กัน proxy ตัดสายที่เงียบเกินไป
      heartbeat = setInterval(() => {
        try {
          write(": ping\n\n");
        } catch {
          clearInterval(heartbeat);
        }
      }, HEARTBEAT_MS);
    },
    cancel() {
      clearInterval(heartbeat);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // กัน nginx บัฟเฟอร์จนสัญญาณมาถึงช้า
    },
  });
});

const signalSchema = z.object({
  type: z.enum([
    "hand_raise",
    "hand_lower",
    "vote_create",
    "vote_cast",
    "vote_close",
    "subtitle_text",
    "doc_share",
    "doc_share_page",
    "doc_share_stop",
  ]),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const POST = withApi(async (request: Request, ctx: Ctx) => {
  const { id: meetingId } = await ctx.params;
  const user = await requireAuth(request);
  await requireMeetingAccess(user, meetingId, "meeting.join");

  const signal = signalSchema.parse(await readJson(request));

  // ผู้ส่งมาจาก session — client กำหนดเองไม่ได้ ไม่งั้นยกมือแทนคนอื่นหรือปลอมชื่อในซับไตเติลได้
  publish(meetingId, {
    ...signal,
    senderId: user.id,
    senderName: user.name,
    timestamp: Date.now(),
  });

  return Response.json({ ok: true });
});
