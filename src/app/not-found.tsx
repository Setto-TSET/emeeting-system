import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <span className="material-symbols-outlined text-5xl text-muted-foreground">search_off</span>
      <div>
        <h1 className="text-lg font-semibold">ไม่พบหน้าที่ต้องการ</h1>
        <p className="mt-1 text-sm text-muted-foreground">ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกย้ายไปแล้ว</p>
      </div>
      <Link href="/" className="rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground pointer-coarse:min-h-11 inline-flex items-center">
        กลับหน้าแรก
      </Link>
    </div>
  );
}
