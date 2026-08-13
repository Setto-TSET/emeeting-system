"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { users, AppUser } from "@/data";

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

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser>(users[0]);
  const [initialized, setInitialized] = useState(false);

  // Load on mount — แท็บใหม่หยิบผู้ใช้ล่าสุดจาก localStorage มาเป็นค่าตั้งต้นครั้งเดียว
  // แล้วหลังจากนั้นแยกตัวตนของตัวเองอิสระ
  useEffect(() => {
    try {
      const stored =
        sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : null;
      const resolved = users.find((u) => u.id === parsed?.id) ?? users[0];
      setCurrentUser(resolved);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
    } catch (e) {
      console.error("Failed to load user from storage", e);
    }
    setInitialized(true);
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

