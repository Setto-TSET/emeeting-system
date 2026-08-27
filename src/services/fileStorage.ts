// ═══════════════════════════════════════════
// File Storage — ไฟล์เอกสารอยู่ที่ server แล้ว (เดิมเก็บ IndexedDB ในเครื่องคนอัปโหลด)
//
// ทำไมต้องย้าย: IndexedDB อยู่ในเบราว์เซอร์เครื่องเดียว คนอื่นในห้องประชุมเปิดไฟล์
// ที่ถูกแชร์ไม่ได้เลย — เห็นแค่ชื่อกับเลขหน้า
//
// storageKey ที่คืนออกไปคือ id ของไฟล์บน server ผู้เรียกที่มีแต่ storageKey
// (คอมโพเนนต์ตัวอ่านเอกสาร) เปิดไฟล์ผ่าน GET /api/files/:id ได้โดยไม่ต้องรู้ว่าอยู่ประชุมไหน
// สิทธิ์ทุกข้อตัดสินที่ server ตามระดับการมองเห็นของไฟล์นั้น
// ═══════════════════════════════════════════

import { apiBaseUrl, getAccessToken } from "@/services/api/client";
import { uploadMeetingFile } from "@/services/api/meetings";

export type StoredFileMeta = {
  storageKey: string;
  sizeBytes: number;
  mimeType: string;
};

/**
 * อัปโหลดไฟล์เข้าการประชุม คืนกุญแจสำหรับเปิดกลับมา
 * visibility ตั้งค่าเริ่มต้นเป็น participants — แคบไว้ก่อน ผู้จัดค่อยเปิดกว้างทีหลัง
 */
export async function putFile(
  file: File,
  meetingId: string,
  visibility: string = "participants"
): Promise<StoredFileMeta> {
  const meta = await uploadMeetingFile(meetingId, file, visibility);
  return {
    storageKey: meta.id,
    sizeBytes: meta.sizeBytes,
    mimeType: meta.mimeType,
  };
}

/** เปิดไฟล์กลับมาเป็น Blob — null ถ้าไม่พบหรือไม่มีสิทธิ์ */
export async function getFileBlob(storageKey: string): Promise<Blob | null> {
  const token = getAccessToken();
  try {
    const res = await fetch(`${apiBaseUrl()}/api/files/${storageKey}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** สร้าง object URL สำหรับใช้กับ <iframe>/<img> — คนเรียกต้อง revokeObjectURL เอง */
export async function getFileObjectUrl(storageKey: string): Promise<string | null> {
  const blob = await getFileBlob(storageKey);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function removeFile(storageKey: string, meetingId: string): Promise<void> {
  const token = getAccessToken();
  await fetch(`${apiBaseUrl()}/api/meetings/${meetingId}/files/${storageKey}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

/** อ่านง่ายๆ: 1234567 → "1.2 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
