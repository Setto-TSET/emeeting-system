"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { meetings as defaultMeetings, Meeting, MeetingFile, MeetingParticipant } from "@/data";

type MeetingContextType = {
  meetings: Meeting[];
  addMeeting: (meeting: Meeting) => void;
  updateMeeting: (meetingId: string, updated: Partial<Meeting>) => void;
  addMeetingFile: (meetingId: string, file: MeetingFile) => void;
  addMeetingComment: (meetingId: string, agendaId: string, comment: { by: string; text: string; time: string }) => void;
  updateActiveAgenda: (meetingId: string, agendaId: string | null) => void;
  joinMeetingAsExternal: (meetingId: string, name: string, role: string) => MeetingParticipant;
  addChatMessage: (meetingId: string, message: { sender: string; text: string; time: string }) => void;
};

/**
 * ขึ้นเลขเวอร์ชันท้ายคีย์เมื่อโครงสร้าง mock data เปลี่ยน
 * เพื่อให้เบราว์เซอร์ที่เคยเปิดระบบมาก่อนโหลดข้อมูลชุดใหม่ แทนที่จะค้างข้อมูลเก่าใน localStorage
 * v2 — เพิ่ม conferenceProvider + ลิงก์ตัวอย่าง Teams/Zoom
 * v3 — เพิ่ม userId/committeeId/organizerId (เปลี่ยนการจับคู่จากอีเมล/ชื่อ มาเป็น id)
 * v4 — เพิ่ม conferenceRoomKey/transcriptStatus (เตรียม seam ระบบประชุมในเว็บ + ถอดเสียง)
 * v5 — ตัวอย่าง MT-2569-008 เปลี่ยนเป็น provider webex เพื่อโชว์ engine ฝัง (mock)
 */
const STORAGE_KEY = "meeting_system_meetings_v5";

const MeetingContext = createContext<MeetingContextType | null>(null);

export function MeetingProvider({ children }: { children: ReactNode }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setMeetings(JSON.parse(stored));
      } else {
        setMeetings(defaultMeetings);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultMeetings));
      }
    } catch (e) {
      console.error("Failed to load meetings from localStorage", e);
      setMeetings(defaultMeetings);
    }
    setInitialized(true);
  }, []);

  /**
   * mutate ทุกอย่างต้องผ่านฟังก์ชันนี้ — รับ updater ที่ทำงานกับ prev ล่าสุด
   * ห้ามอ่าน `meetings` จาก closure ตอน mutate เพราะ 2 call ในเทิร์นเดียวกันจะทับกัน
   */
  const mutate = (updater: (prev: Meeting[]) => Meeting[]) => {
    setMeetings((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("Failed to save meetings to localStorage", e);
      }
      return next;
    });
  };

  // Listen to storage events to sync across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setMeetings(JSON.parse(e.newValue));
        } catch (err) {
          console.error(err);
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const addMeeting = (meeting: Meeting) => {
    mutate((prev) => [meeting, ...prev]);
  };

  const updateMeeting = (meetingId: string, updated: Partial<Meeting>) => {
    mutate((prev) => prev.map((m) => (m.id === meetingId ? { ...m, ...updated } : m)));
  };

  const addMeetingFile = (meetingId: string, file: MeetingFile) => {
    mutate((prev) =>
      prev.map((m) => (m.id === meetingId ? { ...m, files: [...m.files, file] } : m))
    );
  };

  const addMeetingComment = (
    meetingId: string,
    agendaId: string,
    comment: { by: string; text: string; time: string }
  ) => {
    mutate((prev) =>
      prev.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              agenda: m.agenda.map((a) =>
                a.id === agendaId ? { ...a, comments: [...a.comments, comment] } : a
              ),
            }
          : m
      )
    );
  };

  const updateActiveAgenda = (meetingId: string, agendaId: string | null) => {
    mutate((prev) =>
      prev.map((m) => (m.id === meetingId ? { ...m, activeAgendaId: agendaId } : m))
    );
  };

  const joinMeetingAsExternal = (meetingId: string, name: string, role: string) => {
    // dedup ด้วย sessionId ไม่ใช่ชื่อ — คนสองคนที่ชื่อซ้ำต้องแยกกันได้
    const sessionId = `P-EXT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newParticipant: MeetingParticipant = {
      id: sessionId,
      userId: null, // แขกภายนอก ไม่มีบัญชีในระบบ
      name,
      position: "ผู้เข้าร่วมประชุม",
      role,
      department: "ภายนอกองค์กร",
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@guest.external`,
      attendance: "attend",
      present: true,
      inSystem: false,
    };
    mutate((prev) =>
      prev.map((m) =>
        m.id === meetingId ? { ...m, participants: [...m.participants, newParticipant] } : m
      )
    );
    return newParticipant;
  };

  const addChatMessage = (meetingId: string, msg: { sender: string; text: string; time: string }) => {
    mutate((prev) =>
      prev.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              chatMessages: [
                ...(m.chatMessages || []),
                { id: `msg-${Date.now()}-${Math.random()}`, ...msg },
              ],
            }
          : m
      )
    );
  };

  return (
    <MeetingContext.Provider
      value={{
        meetings,
        addMeeting,
        updateMeeting,
        addMeetingFile,
        addMeetingComment,
        updateActiveAgenda,
        joinMeetingAsExternal,
        addChatMessage,
      }}
    >
      {initialized ? children : <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground bg-background">กำลังโหลดข้อมูลการประชุม...</div>}
    </MeetingContext.Provider>
  );
}

export function useMeetings() {
  const context = useContext(MeetingContext);
  if (!context) throw new Error("useMeetings must be used within a MeetingProvider");
  return context;
}
