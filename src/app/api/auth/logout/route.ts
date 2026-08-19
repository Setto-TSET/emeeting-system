// POST /api/auth/logout — ลบ session cookie

import { destroySession } from "@/lib/api/auth";
import { withApi } from "@/lib/api/respond";

export const POST = withApi(async () => {
  await destroySession();
  return Response.json({ ok: true });
});
