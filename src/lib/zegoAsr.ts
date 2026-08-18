// ═══════════════════════════════════════════
// ZegoCloud Cloud Real-Time ASR — Start/Stop task ผูกกับ RTC room
// อ้างอิง: https://www.zegocloud.com/docs/cloud-realtime-asr/api-reference/{start,stop}
// ═══════════════════════════════════════════

import { callZegoServerApi } from "./zegoServerApi";

const ASR_BASE_URL = "https://cloud-realtime-asr-api.zegotech.cn/";

type StartAsrData = { TaskId: string };

/** เริ่มถอดเสียงทั้งห้อง (RecognitionRange: 0 = ทุก stream) — คืน TaskId ใช้ตอน stop */
export async function startAsrTask(
  appId: number,
  serverSecret: string,
  roomId: string
): Promise<string> {
  const res = await callZegoServerApi<StartAsrData>(
    ASR_BASE_URL,
    "StartRealtimeASRTask",
    appId,
    serverSecret,
    { RoomId: roomId, RecognitionRange: 0 }
  );
  if (res.Code !== 0 || !res.Data?.TaskId) {
    throw new Error(`ZegoCloud StartRealtimeASRTask ล้มเหลว: [${res.Code}] ${res.Message}`);
  }
  return res.Data.TaskId;
}

export async function stopAsrTask(
  appId: number,
  serverSecret: string,
  taskId: string
): Promise<void> {
  const res = await callZegoServerApi(ASR_BASE_URL, "StopRealtimeASRTask", appId, serverSecret, {
    TaskId: taskId,
  });
  if (res.Code !== 0) {
    throw new Error(`ZegoCloud StopRealtimeASRTask ล้มเหลว: [${res.Code}] ${res.Message}`);
  }
}
