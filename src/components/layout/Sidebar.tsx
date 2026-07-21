"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { systemRoleLabels, systemRoleColors } from "@/data";
import { useCurrentUser } from "@/context/UserContext";
import { getNavGroups, HOME_ROUTE } from "@/lib/access";

function SidebarNav({ pathname }: { pathname: string }) {
  const router = useRouter();
  const { currentUser } = useCurrentUser();
  // เมนูขึ้นกับสิทธิ์ — ผู้เข้าร่วมเห็นแค่ หน้าหลัก / การประชุมของฉัน / เอกสาร
  const navGroups = getNavGroups(currentUser.systemRole);
  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/portal") return pathname === "/portal";
    if (href === "/meetings") return pathname === "/meetings";
    if (href === "/meetings/new") return pathname === "/meetings/new";
    if (href === "/booking") return pathname === "/booking";
    if (href === "/booking/my-bookings") return pathname === "/booking/my-bookings";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-full flex-col bg-transparent">
      {/* Logo */}
      <Link href={HOME_ROUTE} className="block px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white flex-shrink-0">
            <span className="material-symbols-outlined text-[26px] text-primary">event_note</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-sidebar-foreground">
              e-Meeting
            </p>
            <p className="text-[11px] opacity-90 text-sidebar-foreground/70 mt-0.5">
              ระบบบริหารการประชุม
            </p>
          </div>
        </div>
      </Link>

      <div className="mx-4 h-px bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 custom-scrollbar space-y-4">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.groupLabel && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 select-none">
                {group.groupLabel}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                      active
                        ? "bg-sidebar-primary/10 text-sidebar-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "material-symbols-outlined text-[20px] transition-all",
                        active
                          ? "fill text-sidebar-primary"
                          : "text-sidebar-foreground/70 group-hover:text-sidebar-foreground"
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                    {active && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mx-4 h-px bg-sidebar-border" />

      {/* User */}
      <div className="p-4">
        <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-sidebar-accent transition-colors">
          <Avatar className="h-8 w-8 bg-white/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px] text-sidebar-foreground">person</span>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-sidebar-foreground">{currentUser.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`inline-flex items-center rounded-md border px-1 text-[9px] font-semibold ${systemRoleColors[currentUser.systemRole]}`}>
                {systemRoleLabels[currentUser.systemRole]}
              </span>
              <p className="text-[10px] opacity-90 text-sidebar-foreground/70 truncate">{currentUser.department}</p>
            </div>
          </div>
          <button
            onClick={() => router.push("/")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-white/10 hover:text-white transition-colors"
            title="ออกจากระบบ"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop */}
      <aside className="fixed left-4 top-4 bottom-4 z-40 hidden w-60 flex-col overflow-hidden rounded-2xl glass-panel-primary md:flex">
        <SidebarNav pathname={pathname} />
      </aside>

      {/* Mobile trigger */}
      <div className="fixed left-3 top-3 z-50 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg shadow-sm">
              <span className="material-symbols-outlined text-xl">menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-56 p-0 [&>button]:hidden">
            <SidebarNav pathname={pathname} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
