// ═══════════════════════════════════════════
// ตัวห่อ route handler — แปลง error ที่โยนออกมาเป็น HTTP response รูปแบบเดียวกันทุกเส้น
//
// ทำให้ handler แต่ละตัวเขียนเป็นเส้นตรง (requireAuth() แล้วทำงานต่อได้เลย)
// ไม่ต้อง if/else ตรวจ response ทุกบรรทัด
// ═══════════════════════════════════════════

import { ZodError } from "zod";
import { ApiError } from "./auth";

export function withApi<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof ZodError) {
        return Response.json(
          { error: "ข้อมูลที่ส่งมาไม่ถูกต้อง", issues: error.issues },
          { status: 400 }
        );
      }
      console.error("[api] unhandled error", error);
      return Response.json({ error: "เกิดข้อผิดพลาดในระบบ" }, { status: 500 });
    }
  };
}

/** อ่าน JSON body — body ว่างหรือ parse ไม่ได้ให้ตอบ 400 แทนที่จะพัง 500 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "ต้องส่ง body เป็น JSON");
  }
}
