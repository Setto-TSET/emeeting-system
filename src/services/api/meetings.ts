// ═══════════════════════════════════════════
// Meetings API — การประชุมและไฟล์เอกสารอยู่ที่ server แล้ว ไม่ใช่ localStorage
//
// backend เก็บก้อน Meeting เป็น JSON ตรงๆ จึงส่ง type เดิมไป-กลับได้ทั้งก้อน
// สิทธิ์ทุกข้อตัดสินที่ server — ที่นี่แค่เรียก
// ═══════════════════════════════════════════

import { Meeting } from "@/data";
import { apiFetch, apiBaseUrl, getAccessToken } from "./client";

export type RemoteFileMeta = {
  id: string;
  meetingId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  visibility: string;
  uploadedBy: string;
  uploadedAt: number;
};

export async function fetchMeetings(): Promise<Meeting[]> {
  const { meetings } = await apiFetch<{ meetings: Meeting[] }>("/api/meetings");
  return meetings;
}

export async function createMeeting(meeting: Meeting): Promise<Meeting> {
  const body = await apiFetch<{ meeting: Meeting }>("/api/meetings", {
    method: "POST",
    body: JSON.stringify({ meeting }),
  });
  return body.meeting;
}

export async function saveMeeting(meeting: Meeting): Promise<Meeting> {
  const body = await apiFetch<{ meeting: Meeting }>(`/api/meetings/${meeting.id}`, {
    method: "PUT",
    body: JSON.stringify({ meeting }),
  });
  return body.meeting;
}

/** อัปโหลดเป็น base64 — ฝั่ง server จำกัดไว้ 20MB ต่อไฟล์ */
export async function uploadMeetingFile(
  meetingId: string,
  file: File,
  visibility: string
): Promise<RemoteFileMeta> {
  const contentBase64 = await fileToBase64(file);
  const body = await apiFetch<{ file: RemoteFileMeta }>(`/api/meetings/${meetingId}/files`, {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      visibility,
      contentBase64,
    }),
  });
  return body.file;
}

/**
 * โหลดไฟล์จริงกลับมาเป็น Blob
 * ใช้ fetch ตรงแทน apiFetch เพราะ apiFetch คาดหวัง JSON เสมอ
 */
export async function downloadMeetingFile(
  meetingId: string,
  fileId: string
): Promise<Blob | null> {
  const token = getAccessToken();
  const res = await fetch(`${apiBaseUrl()}/api/meetings/${meetingId}/files/${fileId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  return res.blob();
}

export async function deleteMeetingFile(meetingId: string, fileId: string): Promise<void> {
  await apiFetch(`/api/meetings/${meetingId}/files/${fileId}`, { method: "DELETE" });
}

/** FileReader คืน data URL — ตัดหัว "data:...;base64," ออกให้เหลือเฉพาะเนื้อ */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
