"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { toast } from "sonner";
import { Meeting, MeetingFile, MeetingParticipant } from "@/data";
import { apiCall } from "@/lib/api/client";

// การประชุมอยู่ที่ server แล้ว (ตาราง Meeting + ตารางลูก) ไม่ใช่ localStorage ของแต่ละเครื่อง
//
// รูปแบบการเขียน: อัปเดตในหน้าจอทันที (optimistic) แล้วยิง API ตามหลัง
// ถ้า server ปฏิเสธ (หมดสิทธิ์ / ประชุมรับรองแล้ว) จะเด้ง toast แล้วดึงข้อมูลจริงมาทับ
// — ทำแบบนี้เพื่อให้ call site เดิมทั้ง ~30 จุดเรียกเหมือนเดิมโดยไม่ต้องแก้เป็น async
//
// ponytail: ไม่มี realtime — โหลดใหม่ตอน mount และตอนกลับมาโฟกัสหน้าต่าง
// ถ้าต้องเห็นการแก้ของคนอื่นทันทีค่อยเติม poll หรือ SSE เหมือนที่ทำกับโหวต

type MeetingContextType = {
  meetings: Meeting[];
  addMeeting: (meeting: Meeting) => void;
  updateMeeting: (meetingId: string, updated: Partial<Meeting>) => void;
  addMeetingFile: (meetingId: string, file: MeetingFile) => void;
  addMeetingComment: (meetingId: string, agendaId: string, comment: { by: string; text: string; time: string }) => void;
  updateActiveAgenda: (meetingId: string, agendaId: string | null) => void;
  joinMeetingAsExternal: (meetingId: string, name: string, role: string) => MeetingParticipant;
  addChatMessage: (meetingId: string, message: { sender: string; text: string; time: string }) => void;
  reload: () => void;
};

const MeetingContext = createContext<MeetingContextType | null>(null);

export function MeetingProvider({ children }: { children: ReactNode }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [initialized, setInitialized] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await apiCall<{ meetings: Meeting[] }>("/api/meetings");
      setMeetings(data.meetings);
    } catch (e) {
      // ยังไม่ได้ล็อกอินก็ไม่ต้องรบกวน — หน้า login จะพาไปเอง
      if (!(e instanceof Error) || !e.message.includes("เข้าสู่ระบบ")) {
        console.error("[meetings] load failed", e);
      }
    } finally {
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState เกิดหลัง await ไม่ใช่ระหว่าง render
    reload();
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  /** เขียนในหน้าจอก่อน แล้วซิงค์กับ server — ล้มเหลวเมื่อไหร่ดึงของจริงมาทับ */
  const sync = useCallback(
    (local: (prev: Meeting[]) => Meeting[], request: () => Promise<unknown>) => {
      setMeetings(local);
      request().catch((e) => {
        toast.error("บันทึกไม่สำเร็จ", { description: e instanceof Error ? e.message : undefined });
        reload();
      });
    },
    [reload]
  );

  const addMeeting = useCallback(
    (meeting: Meeting) => {
      sync(
        (prev) => [meeting, ...prev],
        () => apiCall("/api/meetings", { method: "POST", body: JSON.stringify(meeting) })
      );
    },
    [sync]
  );

  const updateMeeting = useCallback(
    (meetingId: string, updated: Partial<Meeting>) => {
      sync(
        (prev) => prev.map((m) => (m.id === meetingId ? { ...m, ...updated } : m)),
        () =>
          apiCall(`/api/meetings/${meetingId}`, { method: "PATCH", body: JSON.stringify(updated) })
      );
    },
    [sync]
  );

  const addMeetingFile = useCallback(
    (meetingId: string, file: MeetingFile) => {
      // ส่งรายการไฟล์ทั้งชุดไป เพราะ PATCH เขียนทับทั้ง array (ดูหมายเหตุใน route)
      setMeetings((prev) => {
        const next = prev.map((m) =>
          m.id === meetingId ? { ...m, files: [...m.files, file] } : m
        );
        const target = next.find((m) => m.id === meetingId);
        if (target) {
          apiCall(`/api/meetings/${meetingId}`, {
            method: "PATCH",
            body: JSON.stringify({ files: target.files }),
          }).catch((e) => {
            toast.error("อัปโหลดไฟล์ไม่สำเร็จ", {
              description: e instanceof Error ? e.message : undefined,
            });
            reload();
          });
        }
        return next;
      });
    },
    [reload]
  );

  const addMeetingComment = useCallback(
    (meetingId: string, agendaId: string, comment: { by: string; text: string; time: string }) => {
      sync(
        (prev) =>
          prev.map((m) =>
            m.id === meetingId
              ? {
                  ...m,
                  agenda: m.agenda.map((a) =>
                    a.id === agendaId ? { ...a, comments: [...a.comments, comment] } : a
                  ),
                }
              : m
          ),
        () =>
          apiCall(`/api/meetings/${meetingId}/agenda/${agendaId}/comments`, {
            method: "POST",
            body: JSON.stringify({ text: comment.text, time: comment.time }),
          })
      );
    },
    [sync]
  );

  const updateActiveAgenda = useCallback(
    (meetingId: string, agendaId: string | null) => {
      sync(
        (prev) => prev.map((m) => (m.id === meetingId ? { ...m, activeAgendaId: agendaId } : m)),
        () =>
          apiCall(`/api/meetings/${meetingId}/active-agenda`, {
            method: "PATCH",
            body: JSON.stringify({ agendaId }),
          })
      );
    },
    [sync]
  );

  const addChatMessage = useCallback(
    (meetingId: string, msg: { sender: string; text: string; time: string }) => {
      sync(
        (prev) =>
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
          ),
        () =>
          apiCall(`/api/meetings/${meetingId}/chat`, {
            method: "POST",
            body: JSON.stringify({ text: msg.text, time: msg.time }),
          })
      );
    },
    [sync]
  );

  const joinMeetingAsExternal = useCallback(
    (meetingId: string, name: string, role: string) => {
      // ponytail: แขกภายนอกยังไม่มี session จึงยิง API ไม่ได้ — เพิ่มเฉพาะในหน้าจอตัวเองไปก่อน
      // ตัวจริงต้องรอ endpoint ที่รับ invite token (ตาราง InviteToken มีใน schema แล้ว)
      const sessionId = `P-EXT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newParticipant: MeetingParticipant = {
        id: sessionId,
        userId: null,
        name,
        position: "ผู้เข้าร่วมประชุม",
        role,
        department: "ภายนอกองค์กร",
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@guest.external`,
        attendance: "attend",
        present: true,
        inSystem: false,
      };
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meetingId ? { ...m, participants: [...m.participants, newParticipant] } : m
        )
      );
      return newParticipant;
    },
    []
  );

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
        reload,
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
