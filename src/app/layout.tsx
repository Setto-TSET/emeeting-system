import type { Metadata, Viewport } from "next";
import { Geist, Kanit } from "next/font/google";
import { Toaster } from "sonner";
import { AppProviders } from "@/components/providers/AppProviders";
import "./globals.css";

const geist = Geist({
  // ชื่อแยกจาก --font-sans ที่ globals.css ประกอบเป็น stack (Kanit ก่อน แล้วค่อย Geist) — ใช้ชื่อเดียวกันจะอ้างตัวเองวน
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  applicationName: "e-Meeting",
  title: {
    default: "ระบบบริหารการประชุมและจองห้องประชุม — e-Meeting",
    template: "%s — e-Meeting",
  },
  description:
    "ระบบบริหารจัดการการประชุมและจองห้องประชุม รวมทั้งการเตรียมวาระ องค์ประชุม รายงาน และรับรองการประชุม",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  // ระบบภายในของหน่วยงาน — ไม่ให้เครื่องมือค้นหาเก็บหน้าใดไปแสดง
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // ให้หน้าเว็บกินพื้นที่ใต้รอยบาก/แถบโฮม แล้วจัดระยะเองด้วย env(safe-area-inset-*)
  viewportFit: "cover",
  themeColor: "#737300",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${geist.variable} ${kanit.variable} h-full antialiased`}
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <AppProviders>
          {children}
        </AppProviders>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
