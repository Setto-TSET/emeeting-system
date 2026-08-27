"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { Meeting, MeetingFile, MeetingParticipant } from "@/data";
import { ApiError } from "@/services/api/client";
import { createMeeting, fetchMeetings, saveMeeting } from "@/services/api/meetings";
import { useCurrentUser } from "@/context/UserContext";

type MeetingContextType = {
  meetings: Meeting[];
  /** true ระหว่างดึงรายการจาก server ครั้งแรกของผู้ใช้คนนี้ */
  loading: boolean;
  /** ข้อความผิดพลาดล่าสุดจากการคุยกับ server — null คือปกติ */
  error: string | null;
  reload: () => Promise<void>;
  addMeeting: (meeting: Meeting) => void;
  updateMeeting: (meetingId: string, updated: Partial<Meeting>) => void;
  addMeetingFile: (meetingId: string, file: MeetingFile) => void;
  addMeetingComment: (meetingId: string, agendaId: string, comment: { by: string; text: string; time: string }) => void;
  updateActiveAgenda: (meetingId: string, agendaId: string | null) => void;
  joinMeetingAsExternal: (meetingId: string, name: string, role: string) => MeetingParticipant;
  addChatMessage: (meetingId: string, message: { sender: string; text: string; time: string }) => void;
};

const MeetingContext = createContext<MeetingContextType | null>(null);

/**
 * การประชุมทั้งหมดอยู่ที่ server แล้ว (เดิม localStorage คีย์ meeting_system_meetings_v9)
 *
 * ทำไมต้องย้าย: ประชุมที่เลขาฯ สร้างไม่มีใครเห็นนอกจากเครื่องตัวเอง และ WebSocket
 * ปฏิเสธการเข้าห้อง (รหัส 4403) เพราะ backend หาการประชุมนั้นใน MySQL ไม่เจอ
 *
 * รูปแบบการเขียน: อัปเดตหน้าจอทันทีแล้วค่อยยิงขึ้น server (optimistic)
 * ถ้า server ปฏิเสธ — ดึงของจริงกลับมาทับ ไม่ปล่อยให้หน้าจอโชว์สิ่งที่ไม่ได้ถูกบันทึก
 */
export function MeetingProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useCurrentUser();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // กระจกเงาของ state สำหรับให้ mutate อ่านค่าล่าสุดได้โดยไม่ต้องพึ่ง closure
  // (สอง mutate ในเทิร์นเดียวกันเคยทับกันเพราะอ่าน meetings จาก closure)
  const meetingsRef = useRef<Meeting[]>([]);

  const apply = useCallback((next: Meeting[]) => {
    meetingsRef.current = next;
    setMeetings(next);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const fromServer = await fetchMeetings();
      apply(fromServer);
      setError(null);
    } catch (e) {
      // ยังไม่ล็อกอิน (หน้า login) — ไม่ใช่ความผิดพลาดที่ต้องแจ้งผู้ใช้
      if (e instanceof ApiError && e.status === 401) {
        apply([]);
        setError(null);
      } else {
        setError(e instanceof ApiError ? e.message : "โหลดรายการประชุมไม่สำเร็จ");
      }
    } finally {
      setLoading(false);
    }
  }, [apply]);

  // ดึงใหม่ทุกครั้งที่ผู้ใช้เปลี่ยน — ล็อกอินเสร็จคือจังหวะที่ token พร้อมใช้
  useEffect(() => {
    void reload();
  }, [currentUser.id, reload]);

  /** เขียนการประชุมที่เปลี่ยนไปขึ้น server แล้วเอาค่าที่ server ยืนยันกลับมาทับ */
  const persist = useCallback(
    async (meeting: Meeting) => {
      try {
        const saved = await saveMeeting(meeting);
        apply(meetingsRef.current.map((m) => (m.id === saved.id ? saved : m)));
        setError(null);
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "บันทึกการประชุมไม่สำเร็จ";
        // ดึงของจริงกลับมาทับก่อน แล้วค่อยตั้ง error — reload ล้าง error ทุกครั้งที่สำเร็จ
        // ถ้าตั้งก่อนจะโดนล้างทิ้ง ผู้ใช้เห็นค่าเด้งกลับโดยไม่รู้ว่าเพราะอะไร
        await reload();
        setError(message);
      }
    },
    [apply, reload]
  );

  /**
   * mutate ทุกอย่างต้องผ่านฟังก์ชันนี้ — อัปเดตหน้าจอก่อน แล้วส่งเฉพาะการประชุม
   * ที่เนื้อหาเปลี่ยนจริงขึ้น server (ไม่ยิงทั้งรายการทุกครั้ง)
   */
  const mutate = useCallback(
    (updater: (prev: Meeting[]) => Meeting[]) => {
      const prev = meetingsRef.current;
      const next = updater(prev);
      apply(next);

      const before = new Map(prev.map((m) => [m.id, JSON.stringify(m)]));
      for (const meeting of next) {
        if (before.get(meeting.id) !== JSON.stringify(meeting)) void persist(meeting);
      }
    },
    [apply, persist]
  );

  const addMeeting = useCallback(
    (meeting: Meeting) => {
      apply([meeting, ...meetingsRef.current]);
      void (async () => {
        try {
          const saved = await createMeeting(meeting);
          apply(meetingsRef.current.map((m) => (m.id === saved.id ? saved : m)));
          setError(null);
        } catch (e) {
          const message = e instanceof ApiError ? e.message : "สร้างการประชุมไม่สำเร็จ";
          await reload();
          setError(message);
        }
      })();
    },
    [apply, reload]
  );

  const updateMeeting = useCallback(
    (meetingId: string, updated: Partial<Meeting>) => {
      mutate((prev) => prev.map((m) => (m.id === meetingId ? { ...m, ...updated } : m)));
    },
    [mutate]
  );

  const addMeetingFile = useCallback(
    (meetingId: string, file: MeetingFile) => {
      mutate((prev) =>
        prev.map((m) => (m.id === meetingId ? { ...m, files: [...m.files, file] } : m))
      );
    },
    [mutate]
  );

  const addMeetingComment = useCallback(
    (meetingId: string, agendaId: string, comment: { by: string; text: string; time: string }) => {
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
    },
    [mutate]
  );

  const updateActiveAgenda = useCallback(
    (meetingId: string, agendaId: string | null) => {
      mutate((prev) =>
        prev.map((m) => (m.id === meetingId ? { ...m, activeAgendaId: agendaId } : m))
      );
    },
    [mutate]
  );

  const joinMeetingAsExternal = useCallback(
    (meetingId: string, name: string, role: string) => {
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
    },
    [mutate]
  );

  const addChatMessage = useCallback(
    (meetingId: string, msg: { sender: string; text: string; time: string }) => {
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
    },
    [mutate]
  );

  return (
    <MeetingContext.Provider
      value={{
        meetings,
        loading,
        error,
        reload,
        addMeeting,
        updateMeeting,
        addMeetingFile,
        addMeetingComment,
        updateActiveAgenda,
        joinMeetingAsExternal,
        addChatMessage,
      }}
    >
      {children}
    </MeetingContext.Provider>
  );
}

export function useMeetings() {
  const context = useContext(MeetingContext);
  if (!context) throw new Error("useMeetings must be used within a MeetingProvider");
  return context;
}
