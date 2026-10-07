import type { MetadataRoute } from "next";

// ระบบภายในของหน่วยงาน — ปิดการเก็บข้อมูลทุกหน้า (คู่กับ robots meta ใน layout.tsx)
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
