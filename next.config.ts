import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "export", // Commented out for standard Vercel deployment
  devIndicators: false,
  // /_next/image ตอบ 404 บน Vercel project นี้ รูปที่ผ่าน next/image เลยแตกทั้งหมด (โลโก้หน้า login)
  // รูปในระบบมีแค่โลโก้ที่ย่อขนาดไว้แล้ว ไม่ต้องพึ่ง optimizer — ส่งไฟล์ตรงจาก public/
  images: { unoptimized: true },
  // ignoreBuildErrors ถูกตัดออกแล้ว — เดิมเปิดไว้เพราะ backend/ (Express แยกโปรเจกต์) โดน
  // type-check พ่วงไปด้วยแล้ว fail จาก node_modules ที่ backend/ เองไม่ได้ npm install
  // (ดู tsconfig.json exclude) แก้ที่ต้นเหตุแล้วแทน — build ตอนนี้เช็ค type จริง
};

export default nextConfig;
