"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { users, AppUser } from "@/data";
import { authHeaders } from "@/lib/session";

type Ctx = {
  currentUser: AppUser;
  setCurrentUser: (u: AppUser) => void;
  users: AppUser[];
};

const UserContext = createContext<Ctx | null>(null);

// ตัวตนของผู้ใช้เก็บใน sessionStorage — แยกต่อแท็บ
// เดิมเก็บใน localStorage แล้ว sync ข้ามแท็บ ทำให้เปิดหลายแท็บเป็นคนละบทบาทไม่ได้
// (ทุกแท็บถูกดึงให้เป็นคนเดียวกันหมด) จึงทดสอบประชุมหลายคนบนเครื่องเดียวไม่ได้เลย
const STORAGE_KEY = "meeting_system_current_user";

function readStoredUser(): AppUser | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as AppUser) : null;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser>(users[0]);
  const [initialized, setInitialized] = useState(false);

  // ตัวตนที่แท้จริงมาจาก session ฝั่ง server (/api/auth/me) — ไม่ใช่รายชื่อ mock อีกแล้ว
  // สำคัญกับแขกที่เข้าผ่านลิงก์เชิญเป็นพิเศษ เพราะแขกไม่มีอยู่ในรายชื่อ mock เลย
  // เรียก API ไม่สำเร็จ (ยังไม่ล็อกอิน) ค่อยถอยไปใช้ค่าที่จำไว้ในเครื่องเพื่อให้หน้า login ทำงานได้
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user?: AppUser } | null) => {
        if (cancelled) return;
        const resolved =
          data?.user ?? readStoredUser() ?? users[0];
        setCurrentUser(resolved);
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
        } catch (e) {
          console.error("Failed to save user to storage", e);
        }
      })
      .finally(() => {
        if (!cancelled) setInitialized(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeCurrentUser = (u: AppUser) => {
    setCurrentUser(u);
    try {
      // sessionStorage = ตัวตนของแท็บนี้, localStorage = ค่าตั้งต้นของแท็บที่จะเปิดใหม่
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    } catch (e) {
      console.error("Failed to save user to storage", e);
    }
  };

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser: changeCurrentUser, users }}>
      {initialized ? children : <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground bg-background">กำลังโหลดข้อมูลผู้ใช้...</div>}
    </UserContext.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within UserProvider");
  return ctx;
}

