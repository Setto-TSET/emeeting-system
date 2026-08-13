import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "export", // Commented out for standard Vercel deployment
  devIndicators: false,
  // ignoreBuildErrors ถูกตัดออกแล้ว — เดิมเปิดไว้เพราะ backend/ (Express แยกโปรเจกต์) โดน
  // type-check พ่วงไปด้วยแล้ว fail จาก node_modules ที่ backend/ เองไม่ได้ npm install
  // (ดู tsconfig.json exclude) แก้ที่ต้นเหตุแล้วแทน — build ตอนนี้เช็ค type จริง
};

export default nextConfig;
