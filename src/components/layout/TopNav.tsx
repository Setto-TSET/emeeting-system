"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { systemRoleLabels, systemRoleColors } from "@/data";
import { useCurrentUser } from "@/context/UserContext";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ไม่มีช่องค้นหาและกระดิ่งแจ้งเตือนแล้ว — ทั้งสองอย่างเป็นของจำลอง (ค้นหาขึ้นว่า "กำลังพัฒนา",
// แจ้งเตือนเป็นข้อความตายตัวชุดเดียวกันทุกคน) ใส่กลับเมื่อมีบริการจริงฝั่ง server

const breadcrumbMap: Record<string, { trail: { label: string; href: string }[]; current: string }> = {
  "/dashboard": { trail: [{ label: "หน้าหลัก", href: "/dashboard" }], current: "ภาพรวม" },
  "/booking": { trail: [{ label: "หน้าหลัก", href: "/dashboard" }], current: "จองห้องประชุม" },
  "/booking/my-bookings": { trail: [{ label: "หน้าหลัก", href: "/dashboard" }, { label: "จองห้องประชุม", href: "/booking" }], current: "การจองของฉัน" },
  "/rooms": { trail: [{ label: "หน้าหลัก", href: "/dashboard" }], current: "ห้องประชุมทั้งหมด" },
  "/meetings": { trail: [{ label: "หน้าหลัก", href: "/dashboard" }], current: "รายการการประชุม" },
  "/meetings/new": { trail: [{ label: "หน้าหลัก", href: "/dashboard" }, { label: "การประชุม", href: "/meetings" }], current: "สร้างการประชุม" },
  "/committees": { trail: [{ label: "หน้าหลัก", href: "/dashboard" }], current: "คณะทำงาน" },
  "/reports": { trail: [{ label: "หน้าหลัก", href: "/dashboard" }], current: "รายงานการประชุม" },
  "/documents": { trail: [{ label: "หน้าหลัก", href: "/dashboard" }], current: "คลังเอกสาร" },
  "/portal": { trail: [], current: "การประชุมของฉัน" },
};

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, signOut } = useCurrentUser();

  let bc = breadcrumbMap[pathname];
  if (!bc) {
    const keys = Object.keys(breadcrumbMap).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (pathname.startsWith(key)) { bc = breadcrumbMap[key]; break; }
    }
  }
  if (!bc) {
    if (pathname.startsWith("/meetings/")) {
      bc = { trail: [{ label: "หน้าหลัก", href: "/dashboard" }, { label: "การประชุม", href: "/meetings" }], current: "รายละเอียดการประชุม" };
    } else {
      bc = { trail: [{ label: "หน้าหลัก", href: "/dashboard" }], current: "" };
    }
  }

  return (
    // มือถือเว้นซ้าย (left-16) ให้ปุ่มเมนูของ Sidebar — เดิม header กว้างเต็มแล้วทับปุ่มจนกดเมนูไม่ได้
    <header className="fixed top-[calc(1rem+env(safe-area-inset-top))] right-2 left-16 z-50 flex h-14 items-center justify-between gap-2 rounded-2xl glass-panel px-3 md:px-4 md:left-sidebar md:right-4 border-none shadow-sm">
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="text-sm flex-nowrap">
          {/* มือถือแสดงเฉพาะหน้าปัจจุบัน — เส้นทางเต็มขึ้นหลายบรรทัดจนล้น header สูง 56px */}
          {bc.trail.map((item, i) => (
            <span key={i} className="hidden sm:flex items-center gap-1.5">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={item.href} className="text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
                    {item.label}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <span className="material-symbols-outlined text-sm text-muted-foreground/50">chevron_right</span>
              </BreadcrumbSeparator>
            </span>
          ))}
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="font-semibold text-primary text-sm truncate">{bc.current}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-1 shrink-0">
        {/* ผู้ใช้ที่ล็อกอินอยู่ (อ่านอย่างเดียว) — สลับบัญชีต้องล็อกอินใหม่เพื่อให้ JWT ตรงกับตัวตนเสมอ */}
        <div className="flex items-center gap-1.5 h-8 px-1 sm:px-2">
          <span className={`inline-flex items-center rounded-md border px-1.5 text-tiny font-semibold whitespace-nowrap ${systemRoleColors[currentUser.systemRole]}`}>
            {systemRoleLabels[currentUser.systemRole]}
          </span>
          <span className="hidden md:inline text-xs font-medium max-w-28 truncate">{currentUser.name}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-lg" aria-label="บัญชีผู้ใช้">
              <span className="material-symbols-outlined text-xl text-muted-foreground">account_circle</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 text-sm">
            <DropdownMenuLabel className="space-y-0.5">
              <p className="truncate">{currentUser.name}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{currentUser.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                toast.info("ต้องการความช่วยเหลือ", {
                  description: "ติดต่อผู้ดูแลระบบของสภาเภสัชกรรม เช่น ลืมรหัสผ่าน หรือต้องการสิทธิ์จัดการประชุม",
                })
              }
            >
              <span className="material-symbols-outlined text-base mr-2">help</span> ความช่วยเหลือ
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => { signOut(); router.push("/"); }}>
              <span className="material-symbols-outlined text-base mr-2">logout</span> ออกจากระบบ
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
