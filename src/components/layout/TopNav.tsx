"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { notificationsData, systemRoleLabels, systemRoleColors, systemRoleDescriptions } from "@/data";
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
import { Badge } from "@/components/ui/badge";

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
};

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchText, setSearchText] = useState("");
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState(notificationsData);
  const { currentUser, setCurrentUser, users } = useCurrentUser();

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

  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchText.trim()) {
      toast.info(`ค้นหา: "${searchText}"`, { description: "ฟีเจอร์ค้นหาทั้งระบบอยู่ระหว่างการพัฒนา" });
      setSearchText("");
    }
  };

  return (
    <header className="fixed top-4 right-2 left-2 z-50 flex h-14 items-center justify-between rounded-2xl glass-panel px-4 md:left-[280px] md:right-4 border-none shadow-sm">
      <Breadcrumb>
        <BreadcrumbList className="text-sm">
          {bc.trail.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={item.href} className="text-muted-foreground hover:text-foreground transition-colors">
                    {item.label}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <span className="material-symbols-outlined text-[14px] text-muted-foreground/50">chevron_right</span>
              </BreadcrumbSeparator>
            </span>
          ))}
          <BreadcrumbItem>
            <BreadcrumbPage className="font-semibold text-primary text-sm">{bc.current}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-1">
        <div className="hidden sm:flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 h-7 mr-1">
          <span className="material-symbols-outlined text-[16px] text-muted-foreground">search</span>
          <input
            type="text"
            placeholder="ค้นหาการประชุม / ห้อง..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={handleSearch}
            className="w-36 lg:w-48 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        {/* User / Role Switcher (สำหรับทดสอบสิทธิ์) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 mr-1 rounded-lg">
              <span className={`inline-flex items-center rounded-md border px-1.5 text-[10px] font-semibold ${systemRoleColors[currentUser.systemRole]}`}>
                {systemRoleLabels[currentUser.systemRole]}
              </span>
              <span className="hidden md:inline text-xs font-medium max-w-[110px] truncate">{currentUser.name}</span>
              <span className="material-symbols-outlined text-[16px] text-muted-foreground">expand_more</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 rounded-xl">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>สลับผู้ใช้ (สำหรับทดสอบสิทธิ์)</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
              {users.map(u => {
                const active = u.id === currentUser.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      setCurrentUser(u);
                      toast.success(`สลับเป็น ${u.name}`, { description: systemRoleDescriptions[u.systemRole] });
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-muted/50 flex items-start gap-2 border-l-2 transition-colors ${active ? "bg-primary/5 border-primary" : "border-transparent"}`}
                  >
                    <div className="mt-0.5 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-primary text-[16px]">person</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium truncate">{u.name}</p>
                        <span className={`inline-flex items-center rounded-md border px-1 text-[9px] font-semibold ${systemRoleColors[u.systemRole]}`}>
                          {systemRoleLabels[u.systemRole]}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{u.position} · {u.department}</p>
                    </div>
                    {active && <span className="material-symbols-outlined text-primary text-[16px] mt-1.5">check</span>}
                  </button>
                );
              })}
            </div>
            <DropdownMenuSeparator />
            <div className="px-3 py-2 text-[10px] text-muted-foreground">
              บทบาทกำหนดว่าจะเห็นเอกสารใดในระบบ
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu open={isNotifOpen} onOpenChange={setIsNotifOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-lg">
              <span className="material-symbols-outlined text-[20px] text-muted-foreground">notifications</span>
              {notifications.some(n => !n.isRead) && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive ring-1 ring-card" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 rounded-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold text-sm">การแจ้งเตือน</span>
              {notifications.filter(n => !n.isRead).length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{notifications.filter(n => !n.isRead).length} ใหม่</Badge>
              )}
            </div>
            <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
              {notifications.map(notif => (
                <div
                  key={notif.id}
                  className={`flex items-start gap-3 p-4 hover:bg-muted/50 cursor-pointer transition-colors ${!notif.isRead ? 'bg-primary/5' : ''}`}
                  onClick={() => { setIsNotifOpen(false); router.push("/meetings"); }}
                >
                  <div className={`${notif.type === 'warning' ? 'bg-destructive/10' : notif.type === 'success' ? 'bg-green-500/10' : 'bg-primary/10'} p-2 rounded-full mt-0.5 flex-shrink-0`}>
                    <span className={`material-symbols-outlined ${notif.type === 'warning' ? 'text-destructive' : notif.type === 'success' ? 'text-green-600' : 'text-primary'} text-[16px]`}>
                      {notif.type === 'warning' ? 'warning' : notif.type === 'success' ? 'check_circle' : 'info'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{notif.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{notif.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-2">{notif.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-2 border-t text-center">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-primary h-8"
                onClick={() => {
                  setIsNotifOpen(false);
                  setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                  toast.success('อ่านทั้งหมดแล้ว');
                }}
              >
                ทำเครื่องหมายว่าอ่านแล้ว
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex h-8 w-8 rounded-lg"
          onClick={() => toast.info("ศูนย์ช่วยเหลือ", { description: "ติดต่อ: notify@e-office.cloud | โทร: 0-2591-9992" })}
        >
          <span className="material-symbols-outlined text-[20px] text-muted-foreground">help</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex h-8 w-8 rounded-lg">
              <span className="material-symbols-outlined text-[20px] text-muted-foreground">settings</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 text-sm">
            <DropdownMenuLabel>ตั้งค่า</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => toast.info("โปรไฟล์ผู้ใช้", { description: `${currentUser.name} (${currentUser.email})` })}>
              <span className="material-symbols-outlined text-[16px] mr-2">person</span> โปรไฟล์
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.info("การตั้งค่า", { description: "เมนูตั้งค่ากำลังพัฒนา" })}>
              <span className="material-symbols-outlined text-[16px] mr-2">tune</span> การตั้งค่า
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => router.push("/")}>
              <span className="material-symbols-outlined text-[16px] mr-2">logout</span> ออกจากระบบ
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
