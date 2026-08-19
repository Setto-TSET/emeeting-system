// GET /api/auth/me — ตรวจ session ปัจจุบัน คืนผู้ใช้ที่ล็อกอินอยู่

import { getSessionUser } from "@/lib/api/auth";
import { withApi } from "@/lib/api/respond";

export const GET = withApi(async (request: Request) => {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  return Response.json({ user });
});
