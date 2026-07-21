"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { users, AppUser } from "@/data";

type Ctx = {
  currentUser: AppUser;
  setCurrentUser: (u: AppUser) => void;
  users: AppUser[];
};

const UserContext = createContext<Ctx | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser>(users[0]);
  const [initialized, setInitialized] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("meeting_system_current_user");
      if (stored) {
        const parsed = JSON.parse(stored);
        const found = users.find((u) => u.id === parsed.id);
        if (found) setCurrentUser(found);
      } else {
        localStorage.setItem("meeting_system_current_user", JSON.stringify(users[0]));
      }
    } catch (e) {
      console.error("Failed to load user from localStorage", e);
    }
    setInitialized(true);
  }, []);

  // Save to localStorage when switching user
  const changeCurrentUser = (u: AppUser) => {
    setCurrentUser(u);
    try {
      localStorage.setItem("meeting_system_current_user", JSON.stringify(u));
    } catch (e) {
      console.error("Failed to save user to localStorage", e);
    }
  };

  // Cross-tab synchronization
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "meeting_system_current_user" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          const found = users.find((u) => u.id === parsed.id);
          if (found) setCurrentUser(found);
        } catch (err) {
          console.error(err);
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

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

