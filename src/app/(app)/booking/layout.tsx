import type { Metadata } from "next";

// หน้าในโฟลเดอร์นี้เป็น Client Component ประกาศ metadata เองไม่ได้ — ตั้งชื่อแท็บที่ layout แทน
export const metadata: Metadata = { title: "จองห้องประชุม" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
