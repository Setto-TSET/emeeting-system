"use client"; // error boundary ต้องเป็น Client Component

// ใช้เมื่อ root layout พังเอง — ไฟล์นี้แทนที่ layout ทั้งหมด จึงไม่มี globals.css ให้ใช้
// สีจึงเขียนตรงในไฟล์ ใช้ค่าเดียวกับ token --primary/--background ใน globals.css
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f5f5f5", color: "#111827", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "1rem" }}>
        <title>เกิดข้อผิดพลาด — e-Meeting</title>
        <div>
          <h1 style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>ระบบเกิดข้อผิดพลาด</h1>
          <p style={{ fontSize: "0.875rem", color: "#6b7280", margin: "0 0 1rem" }}>กรุณาลองใหม่อีกครั้ง</p>
          <button
            onClick={() => retry()}
            style={{ background: "#737300", color: "#ffffff", border: 0, borderRadius: "0.5rem", padding: "0.75rem 1.25rem", fontSize: "0.875rem", cursor: "pointer" }}
          >
            ลองใหม่
          </button>
        </div>
      </body>
    </html>
  );
}
