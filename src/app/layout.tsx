import type { Metadata } from "next";
import { Geist, Kanit } from "next/font/google";
import { Toaster } from "sonner";
import { AppProviders } from "@/components/providers/AppProviders";
import "./globals.css";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
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
