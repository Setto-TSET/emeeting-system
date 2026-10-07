"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { toast } from "sonner";
import { Meeting, MeetingFile } from "@/data";
import { ApiError } from "@/services/api/client";
import { createMeeting, fetchMeetings, saveMeeting, deleteMeeting, postAgendaComment } from "@/services/api/meetings";
import { useCurrentUser } from "@/context/UserContext";

type MeetingContextType = {
  meetings: Meeting[];
  /** true ระหว่างดึงรายการจาก server */
  loading: boolean;
  /** ข้อความผิดพลาดล่าสุดจากการโหลดรายการ — null คือปกติ */
  error: string | null;
  reload: () => Promise<void>;
  /** คืน true เมื่อ server สร้างสำเร็จ — ผู้เรียกต้องรอก่อนบอกผู้ใช้ว่าสำเร็จหรือพาไปหน้ารายละเอียด */
  addMeeting: (meeting: Meeting) => Promise<boolean>;
  removeMeeting: (meetingId: string) => Promise<void>;
  /** คืน true เมื่อ server บันทึกสำเร็จ ถ้าล้มเหลวจะแจ้งผู้ใช้และดึงของจริงกลับมาทับให้เอง */
  updateMeeting: (meetingId: string, updated: Partial<Meeting>) => Promise<boolean>;
  addMeetingFile: (meetingId: string, file: MeetingFile) => Promise<boolean>;
  addMeetingComment: (meetingId: string, agendaId: string, text: string) => Promise<boolean>;
  updateActiveAgenda: (meetingId: string, agendaId: string | null) => Promise<boolean>;
  /** ใส่ค่าที่ server ประกาศมาทาง realtime ลงหน้าจอเฉย ๆ — ไม่ยิงกลับขึ้น server */
  patchLocal: (meetingId: string, patch: (meeting: Meeting) => Meeting) => void;
};

const MeetingContext = createContext<MeetingContextType | null>(null);

function messageOf(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

/**
 * การประชุมทั้งหมดอยู่ที่ server
 *
 * รูปแบบการเขียน: อัปเดตหน้าจอทันทีแล้วค่อยยิงขึ้น server (optimistic)
 * ถ้า server ปฏิเสธ — แจ้งผู้ใช้ด้วย toast จากจุดนี้จุดเดียว แล้วดึงของจริงกลับมาทับ
 * เดิมความล้มเหลวเก็บไว้ใน error ที่ไม่มีหน้าไหนอ่าน ผู้ใช้เห็นค่าเด้งกลับหลังขึ้นว่า "สำเร็จ" ไปแล้ว
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
      // ส่วน token หมดอายุ apiFetch พาไปหน้า login ให้เองแล้ว
      if (e instanceof ApiError && e.status === 401) {
        apply([]);
        setError(null);
      } else {
        setError(messageOf(e, "โหลดรายการประชุมไม่สำเร็จ"));
      }
    } finally {
      setLoading(false);
    }
  }, [apply]);

  // ดึงใหม่ทุกครั้งที่ผู้ใช้เปลี่ยน — ล็อกอินเสร็จคือจังหวะที่ token พร้อมใช้
  useEffect(() => {
    void reload();
  }, [currentUser.id, reload]);

  /** ล้มเหลวแล้ว: บอกผู้ใช้ก่อน แล้วค่อยดึงของจริงกลับมาทับสิ่งที่หน้าจอแสดงไปล่วงหน้า */
  const rollback = useCallback(
    async (e: unknown, fallback: string) => {
      toast.error(messageOf(e, fallback));
      await reload();
    },
    [reload]
  );

  /** เขียนการประชุมที่เปลี่ยนไปขึ้น server แล้วเอาค่าที่ server ยืนยันกลับมาทับ */
  const persist = useCallback(
    async (meeting: Meeting): Promise<boolean> => {
      try {
        const saved = await saveMeeting(meeting);
        apply(meetingsRef.current.map((m) => (m.id === saved.id ? saved : m)));
        return true;
      } catch (e) {
        await rollback(e, "บันทึกการประชุมไม่สำเร็จ");
        return false;
      }
    },
    [apply, rollback]
  );

  /**
   * mutate ทุกอย่างต้องผ่านฟังก์ชันนี้ — อัปเดตหน้าจอก่อน แล้วส่งเฉพาะการประชุม
   * ที่เนื้อหาเปลี่ยนจริงขึ้น server (ไม่ยิงทั้งรายการทุกครั้ง)
   */
  const mutate = useCallback(
    async (updater: (prev: Meeting[]) => Meeting[]): Promise<boolean> => {
      const prev = meetingsRef.current;
      const next = updater(prev);
      apply(next);

      const before = new Map(prev.map((m) => [m.id, JSON.stringify(m)]));
      const changed = next.filter((m) => before.get(m.id) !== JSON.stringify(m));
      const results = await Promise.all(changed.map(persist));
      return results.every(Boolean);
    },
    [apply, persist]
  );

  const addMeeting = useCallback(
    async (meeting: Meeting): Promise<boolean> => {
      apply([meeting, ...meetingsRef.current]);
      try {
        const saved = await createMeeting(meeting);
        apply(meetingsRef.current.map((m) => (m.id === saved.id ? saved : m)));
        return true;
      } catch (e) {
        await rollback(e, "สร้างการประชุมไม่สำเร็จ");
        return false;
      }
    },
    [apply, rollback]
  );

  // ลบทั้งการประชุม — เอาออกจากจอทันที ถ้า server ปฏิเสธก็ดึงกลับมาแล้วโยน error ต่อ
  // (async เพราะหน้าเรียกต้องรอผลก่อนพาผู้ใช้ออกจากหน้ารายละเอียดที่เพิ่งถูกลบ)
  const removeMeeting = useCallback(
    async (meetingId: string) => {
      const prev = meetingsRef.current;
      apply(prev.filter((m) => m.id !== meetingId));
      try {
        await deleteMeeting(meetingId);
      } catch (e) {
        apply(prev);
        throw e;
      }
    },
    [apply]
  );

  const updateMeeting = useCallback(
    (meetingId: string, updated: Partial<Meeting>) =>
      mutate((prev) => prev.map((m) => (m.id === meetingId ? { ...m, ...updated } : m))),
    [mutate]
  );

  const addMeetingFile = useCallback(
    (meetingId: string, file: MeetingFile) =>
      mutate((prev) => prev.map((m) => (m.id === meetingId ? { ...m, files: [...m.files, file] } : m))),
    [mutate]
  );

  const patchLocal = useCallback(
    (meetingId: string, patch: (meeting: Meeting) => Meeting) => {
      apply(meetingsRef.current.map((m) => (m.id === meetingId ? patch(m) : m)));
    },
    [apply]
  );

  // ความคิดเห็นมี route ของตัวเอง — ผู้เข้าร่วมทั่วไปไม่มีสิทธิ์ PUT ทั้งการประชุม
  const addMeetingComment = useCallback(
    async (meetingId: string, agendaId: string, text: string): Promise<boolean> => {
      try {
        const comment = await postAgendaComment(meetingId, agendaId, text);
        patchLocal(meetingId, (m) => ({
          ...m,
          agenda: m.agenda.map((a) => (a.id === agendaId ? { ...a, comments: [...a.comments, comment] } : a)),
        }));
        return true;
      } catch (e) {
        toast.error(messageOf(e, "ส่งความคิดเห็นไม่สำเร็จ"));
        return false;
      }
    },
    [patchLocal]
  );

  const updateActiveAgenda = useCallback(
    (meetingId: string, agendaId: string | null) =>
      mutate((prev) => prev.map((m) => (m.id === meetingId ? { ...m, activeAgendaId: agendaId } : m))),
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
        removeMeeting,
        updateMeeting,
        addMeetingFile,
        addMeetingComment,
        updateActiveAgenda,
        patchLocal,
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
