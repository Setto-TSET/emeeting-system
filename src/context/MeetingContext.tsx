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
 */
const STORAGE_KEY = "meeting_system_meetings_v4";

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

  // Save to localStorage when meetings change
  const saveMeetings = (newMeetings: Meeting[]) => {
    setMeetings(newMeetings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newMeetings));
    } catch (e) {
      console.error("Failed to save meetings to localStorage", e);
    }
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
    saveMeetings([meeting, ...meetings]);
  };

  const updateMeeting = (meetingId: string, updated: Partial<Meeting>) => {
    const next = meetings.map((m) => (m.id === meetingId ? { ...m, ...updated } : m));
    saveMeetings(next);
  };

  const addMeetingFile = (meetingId: string, file: MeetingFile) => {
    const next = meetings.map((m) => {
      if (m.id === meetingId) {
        return {
          ...m,
          files: [...m.files, file],
        };
      }
      return m;
    });
    saveMeetings(next);
  };

  const addMeetingComment = (
    meetingId: string,
    agendaId: string,
    comment: { by: string; text: string; time: string }
  ) => {
    const next = meetings.map((m) => {
      if (m.id === meetingId) {
        return {
          ...m,
          agenda: m.agenda.map((a) =>
            a.id === agendaId ? { ...a, comments: [...a.comments, comment] } : a
          ),
        };
      }
      return m;
    });
    saveMeetings(next);
  };

  const updateActiveAgenda = (meetingId: string, agendaId: string | null) => {
    const next = meetings.map((m) => (m.id === meetingId ? { ...m, activeAgendaId: agendaId } : m));
    saveMeetings(next);
  };

  const joinMeetingAsExternal = (meetingId: string, name: string, role: string) => {
    const newParticipant: MeetingParticipant = {
      id: `P-EXT-${Date.now()}`,
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

    const next = meetings.map((m) => {
      if (m.id === meetingId) {
        // Prevent duplicate guest additions
        if (m.participants.some((p) => p.name === name)) return m;
        return {
          ...m,
          participants: [...m.participants, newParticipant],
        };
      }
      return m;
    });
    saveMeetings(next);
    return newParticipant;
  };

  const addChatMessage = (meetingId: string, msg: { sender: string; text: string; time: string }) => {
    const next = meetings.map((m) => {
      if (m.id === meetingId) {
        const chatMessages = m.chatMessages || [];
        return {
          ...m,
          chatMessages: [...chatMessages, { id: `msg-${Date.now()}-${Math.random()}`, ...msg }],
        };
      }
      return m;
    });
    saveMeetings(next);
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
