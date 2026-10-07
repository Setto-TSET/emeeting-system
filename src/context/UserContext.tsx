"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { users, AppUser } from "@/data";
import { setAccessToken, USER_STORAGE_KEY } from "@/services/api/client";

type Ctx = {
  currentUser: AppUser;
  setCurrentUser: (u: AppUser) => void;
  signOut: () => void;
  users: AppUser[];
};

const UserContext = createContext<Ctx | null>(null);

// ตัวตนของผู้ใช้เก็บใน sessionStorage — แยกต่อแท็บ
// เดิมเก็บใน localStorage แล้ว sync ข้ามแท็บ ทำให้เปิดหลายแท็บเป็นคนละบทบาทไม่ได้
// (ทุกแท็บถูกดึงให้เป็นคนเดียวกันหมด) จึงทดสอบประชุมหลายคนบนเครื่องเดียวไม่ได้เลย
const STORAGE_KEY = USER_STORAGE_KEY;

// ยังไม่ล็อกอิน — เดิมใช้ users[0] (บัญชีทดสอบคนแรก) เป็นค่าตั้งต้น ทำให้หลังออกจากระบบ
// หน้าเว็บแสดงเป็นคนนั้นอยู่ครู่หนึ่ง ใช้บทบาทที่สิทธิ์น้อยที่สุดแทน
const ANONYMOUS: AppUser = {
  id: "anonymous",
  name: "",
  position: "",
  department: "",
  email: "",
  systemRole: "external",
  committeeIds: [],
};

/** ตัวตนที่เก็บไว้ต้องมีรูปร่างครบ — ผู้ใช้จริงจาก DB อาจไม่มีใน mock users จึงรับตัวที่เก็บไว้ได้เลย */
function isStoredUser(value: unknown): value is AppUser {
  const u = value as Partial<AppUser> | null;
  return typeof u?.id === "string" && typeof u.name === "string" && typeof u.systemRole === "string" && Array.isArray(u.committeeIds);
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser>(ANONYMOUS);
  const [initialized, setInitialized] = useState(false);

  // Load on mount — แท็บใหม่หยิบผู้ใช้ล่าสุดจาก localStorage มาเป็นค่าตั้งต้นครั้งเดียว
  // แล้วหลังจากนั้นแยกตัวตนของตัวเองอิสระ
  useEffect(() => {
    try {
      const stored =
        sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : null;
      // แขกจากลิงก์เชิญและผู้ใช้จริงจาก DB ไม่มีใน mock users — ใช้ตัวที่เก็บไว้ได้เลยถ้ารูปร่างครบ
      // ถ้าค้นไม่เจอแล้วตกไปเป็นคนอื่น ตัวตนจะเปลี่ยนทันทีที่รีเฟรชหน้า
      const resolved: AppUser =
        users.find((u) => u.id === parsed?.id) ?? (isStoredUser(parsed) ? parsed : ANONYMOUS);
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

  // ออกจากระบบ — ล้าง JWT และตัวตนทั้งใน sessionStorage (แท็บนี้) และ localStorage
  // (ค่าตั้งต้นของแท็บใหม่) ไม่งั้นเปิดหน้าใหม่จะเด้งกลับเข้าเป็นคนเดิมทั้งที่ token หมดแล้ว
  const signOut = useCallback(() => {
    setAccessToken(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error("Failed to clear user from storage", e);
    }
    setCurrentUser(ANONYMOUS);
  }, []);

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser: changeCurrentUser, signOut, users }}>
      {initialized ? children : <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground bg-background">กำลังโหลดข้อมูลผู้ใช้...</div>}
    </UserContext.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within UserProvider");
  return ctx;
}

