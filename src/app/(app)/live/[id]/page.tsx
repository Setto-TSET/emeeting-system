"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useMeetings } from "@/context/MeetingContext";
import { useCurrentUser } from "@/context/UserContext";
import { RoomSignalingProvider, useRoomSignaling } from "@/context/RoomSignalingContext";
import { HandRaiseList, type RaisedHand } from "@/components/meeting/HandRaiseList";
import { SimulatedDocumentViewer, DocumentLightbox } from "@/components/meeting/DocumentPreview";
import { ExternalConferenceStage } from "@/components/meeting/ExternalConferenceStage";
import { ZegoCloudEmbedStage } from "@/components/meeting/ZegoCloudEmbedStage";
import { SubtitleBar } from "@/components/meeting/SubtitleBar";
import { VotePanel } from "@/components/meeting/VotePanel";
import { resolveConference } from "@/lib/conference";
import { resolveVideoSurface } from "@/services/video";
import { requestVideoCredential, type VideoCredential } from "@/services/credentials";
import { webSpeechProvider } from "@/services/speech/webSpeechProvider";
import { appendSegment } from "@/services/transcript/store";
import type { RoomSignal } from "@/services/signaling/types";
import { can } from "@/lib/authz";
import { MeetingParticipant, MeetingFile, canViewFile } from "@/data";

type Broadcast = ReturnType<typeof useRoomSignaling>["broadcast"];

/**
 * ต้องเป็นคอมโพเนนต์ลูกที่ render อยู่ใต้ RoomSignalingProvider เพราะ useRoomSignaling()
 * ใช้ไม่ได้ในตัว LiveMeetingRoomPage เอง (มันเป็นคนสร้าง Provider ขึ้นมา ไม่ได้อยู่ใต้ Provider)
 * — ส่ง broadcast กลับขึ้นไปให้ parent ผ่าน ref แทนการยกทั้งหน้าเข้าไปอยู่ใต้ Provider
 *
 * คอมโพเนนต์นี้ mount อยู่ตลอดอายุห้องประชุม (ไม่ผูกกับแท็บที่เปิดอยู่) จึงเป็นที่รวมของทุกสัญญาณ
 * ที่ต้องทำงานได้ไม่ว่าผู้ใช้จะเปิดแท็บไหนอยู่: hand_raise/hand_lower, subtitle_text (คำบรรยายที่ผู้พูดคนอื่นส่งมา —
 * บันทึกท่อน final ที่รับมาลง transcript store ของเครื่องนี้เอง ดูข้อจำกัดที่ store.ts), doc_share* (การแชร์เอกสาร),
 * และ signal_error (แจ้งเตือนเมื่อ server ปฏิเสธเจตนาที่ส่งไป — สัญญาณ vote_* ตอนนี้ VotePanel ฟังเอง)
 */
function RoomSignalBridge({
  currentUserId,
  meetingId,
  meetingStartRef,
  broadcastRef,
  setRaisedHands,
  setLatestSubtitle,
  setSharedFileId,
  setSharedViewerPage,
  isFileVisible,
  setVoteRefreshToken,
}: {
  currentUserId: string;
  meetingId: string;
  meetingStartRef: React.MutableRefObject<number>;
  broadcastRef: React.MutableRefObject<Broadcast | null>;
  setRaisedHands: React.Dispatch<React.SetStateAction<Map<string, RaisedHand>>>;
  setLatestSubtitle: React.Dispatch<React.SetStateAction<RoomSignal<"subtitle_text"> | null>>;
  setSharedFileId: React.Dispatch<React.SetStateAction<string | null>>;
  setSharedViewerPage: React.Dispatch<React.SetStateAction<number>>;
  isFileVisible: (fileId: string) => boolean;
  setVoteRefreshToken: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { broadcast, useSignal } = useRoomSignaling();

  useEffect(() => {
    broadcastRef.current = broadcast;
  }, [broadcast, broadcastRef]);

  useSignal("hand_raise", (signal) => {
    setRaisedHands((prev) => {
      const copy = new Map(prev);
      if (signal.payload.raised) {
        copy.set(signal.senderId, { userId: signal.senderId, userName: signal.senderName, raisedAt: signal.timestamp });
      } else {
        copy.delete(signal.senderId);
      }
      return copy;
    });
  });

  useSignal("hand_lower", (signal) => {
    if (signal.payload.targetUserId === currentUserId) {
      setRaisedHands((prev) => {
        const copy = new Map(prev);
        copy.delete(currentUserId);
        return copy;
      });
      toast.info("โฮสต์ลดมือให้คุณแล้ว");
    } else {
      setRaisedHands((prev) => {
        const copy = new Map(prev);
        copy.delete(signal.payload.targetUserId);
        return copy;
      });
    }
  });

  useSignal("subtitle_text", (signal) => {
    setLatestSubtitle(signal);
    if (signal.payload.isFinal) {
      appendSegment(meetingId, {
        speakerId: signal.senderId,
        speakerName: signal.senderName,
        startSec: (signal.timestamp - meetingStartRef.current) / 1000,
        text: signal.payload.text,
      });
    }
  });

  useSignal("doc_share", (signal) => {
    if (signal.senderId === currentUserId) return; // ไม่ต้อง apply สัญญาณของตัวเองซ้ำ
    // กันชื่อไฟล์ลับหลุดไปหาคนที่ไม่มีสิทธิ์ดู — เช็คสิทธิ์ก่อนแม้แต่จะ toast ชื่อไฟล์
    if (!isFileVisible(signal.payload.fileId)) {
      toast.info(`${signal.senderName} กำลังแชร์เอกสารที่คุณไม่มีสิทธิ์ดู`);
      return;
    }
    setSharedFileId(signal.payload.fileId);
    setSharedViewerPage(1);
    toast.info(`${signal.senderName} กำลังแชร์เอกสาร: ${signal.payload.fileName}`);
  });

  useSignal("doc_share_page", (signal) => {
    if (signal.senderId === currentUserId) return;
    setSharedViewerPage(signal.payload.page);
  });

  useSignal("doc_share_stop", (signal) => {
    if (signal.senderId === currentUserId) return;
    setSharedFileId(null);
    toast.info(`${signal.senderName} หยุดแชร์เอกสารแล้ว`);
  });

  useSignal("signal_error", (signal) => {
    toast.error(signal.payload.reason);
  });

  return null;
}

export default function LiveMeetingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { meetings, updateMeeting, updateActiveAgenda, joinMeetingAsExternal, addChatMessage } = useMeetings();
  const { currentUser } = useCurrentUser();

  // Find meeting
  const meeting = meetings.find((m) => m.id === id);

  // Guest Join State
  const [hasJoined, setHasJoined] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestRole, setGuestRole] = useState("ผู้ทรงคุณวุฒิภายนอก");
  const [localParticipant, setLocalParticipant] = useState<MeetingParticipant | null>(null);

  // UI Control states
  const [raisedHands, setRaisedHands] = useState<Map<string, RaisedHand>>(new Map());
  const handRaised = raisedHands.has(currentUser.id);
  const broadcastRef = useRef<Broadcast | null>(null);
  const [subtitleOn, setSubtitleOn] = useState(false);
  const [latestSubtitle, setLatestSubtitle] = useState<RoomSignal<"subtitle_text"> | null>(null);
  const meetingStartRef = useRef(Date.now());
  const [activeTab, setActiveTab] = useState("agenda");
  const [chatInput, setChatInput] = useState("");
  
  // Document Viewer states
  const [viewingFile, setViewingFile] = useState<MeetingFile | null>(null);
  // เวทีเอกสารที่แชร์ร่วมกัน (ขับเคลื่อนจากสัญญาณ doc_share/doc_share_page ของโฮสต์) กับ
  // lightbox เอกสารส่วนตัวของผู้ใช้แต่ละคน (ขับเคลื่อนจากการเปิดไฟล์ของตัวเอง) ต้องแยกหน้ากันคนละตัว —
  // ไม่งั้นหน้าที่โฮสต์เลื่อนจะไปทับหน้าที่ผู้ใช้กำลังเปิดดูเอกสารคนละไฟล์อยู่ (ดู Fix 4)
  const [sharedViewerPage, setSharedViewerPage] = useState(1);
  const [lightboxPage, setLightboxPage] = useState(1);
  const [viewerZoom, setViewerZoom] = useState(100);
  const [sharedFileId, setSharedFileId] = useState<string | null>(null); // For simulated presentation share
  // นับจำนวนครั้งที่ได้รับสัญญาณ vote_* จาก RoomSignalBridge — VotePanel เฝ้าดูค่านี้เพื่ออ่าน topics ใหม่
  // จาก IndexedDB แม้ผู้ใช้จะไม่ได้เปิดแท็บโหวตอยู่ตอนที่สัญญาณมาถึง (ดู Fix 2)
  const [voteRefreshToken, setVoteRefreshToken] = useState(0);

  // Credential สำหรับ engine ฝัง — null = เข้าห้องจริงไม่ได้ พร้อมเหตุผลใน credentialError
  const [videoCredential, setVideoCredential] = useState<VideoCredential | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);

  // ตัวตนในห้องประชุมของผู้ให้บริการ — ต้องเป็นค่าเดียวกันทั้งตอนขอ token และตอน login
  // เพราะ token ของ ZegoCloud ผูกกับ user_id ถ้าไม่ตรงจะ login ไม่ผ่าน
  // แขกภายนอกไม่มีบัญชี จึงใช้ id ของ session ตัวเอง ไม่งั้นแขกทุกคนชนกันแล้วเตะกันออก
  const roomIdentityId = localParticipant?.userId ?? localParticipant?.id ?? currentUser.id;
  const roomIdentityName = localParticipant?.name ?? currentUser.name;

  useEffect(() => {
    if (!meeting) return;
    const surface = resolveVideoSurface(meeting);
    if (surface.kind !== "embed") return;
    const roomKey = meeting.conferenceRoomKey ?? meeting.id;
    let cancelled = false;
    // เคลียร์ credential เก่าทันที — ไม่งั้นช่วงที่ roomIdentityId เพิ่งเปลี่ยน (เช่น guest join
    // เพิ่ง resolve) แต่ยังรอ token ใหม่ ZegoCloudEmbedStage จะได้ credential ของ identity เก่า
    // คู่กับ userId ใหม่ ไปพร้อมกัน — token ผูกกับ user_id เดิม ไม่ตรงกับที่ engine ใช้ login
    setVideoCredential(null);
    setCredentialError(null);
    requestVideoCredential(surface.engineId, roomKey, roomIdentityId, roomIdentityName).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setVideoCredential(result.credential);
        setCredentialError(null);
      } else {
        setVideoCredential(null);
        setCredentialError(result.reason);
      }
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting?.id, roomIdentityId]);

  // Initialize presence
  useEffect(() => {
    if (!meeting) return;

    // Check if current user is listed in participants
    const existing = meeting.participants.find(
      (p) => p.userId !== null && p.userId === currentUser.id
    );

    if (existing) {
      setLocalParticipant(existing);
      setHasJoined(true);
      // Mark as present in context
      const updatedParticipants = meeting.participants.map((p) =>
        p.id === existing.id ? { ...p, present: true } : p
      );
      updateMeeting(meeting.id, { participants: updatedParticipants });
    } else if (currentUser.systemRole === "admin" || currentUser.systemRole === "secretary") {
      // ผู้จัดการเข้าห้องได้เลยโดยไม่ต้องผ่านฟอร์ม guest
      // ⚠️ ห้ามเขียนกลับเข้า roster ของประชุม — ไม่งั้นทุกครั้งที่ admin เปิดดู
      // จะถูกเติมเป็นองค์ประชุมถาวร ทำให้ยอด "N คนในสาย" บวม
      // และถูกนับรวมตอนแจ้งวาระทางอีเมล
      const managerParticipant: MeetingParticipant = {
        id: `P-visitor-${currentUser.id}`,
        userId: currentUser.id,
        name: currentUser.name,
        position: currentUser.systemRole === "secretary" ? "เลขานุการ" : "ผู้จัดประชุม",
        role: currentUser.position,
        department: currentUser.department,
        email: currentUser.email,
        attendance: "attend",
        present: true,
        inSystem: true,
      };
      setLocalParticipant(managerParticipant);
      setHasJoined(true);
    }
  }, [meeting?.id, currentUser]);

  // Detect when meeting ends (organizer ended it) — show notification to guests
  // Can't use isManager here because it's after early returns, so compute inline
  const isHost = meeting ? can(currentUser, "meeting.host", meeting) : false;
  useEffect(() => {
    if (!meeting || !hasJoined) return;
    if (meeting.status === "waiting_endorse" && !isHost) {
      toast.info("ผู้จัดประชุมได้ปิดห้องประชุมแล้ว", {
        description: "กรุณาออกจากห้องประชุม",
        duration: 5000,
      });
    }
  }, [meeting?.status, hasJoined, isHost]);

  // Handle guest join submit
  const handleGuestJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!meeting) return;
    if (!guestName.trim()) {
      toast.error("กรุณาระบุชื่อของคุณ");
      return;
    }

    const p = joinMeetingAsExternal(meeting.id, guestName.trim(), guestRole);
    setLocalParticipant(p);
    setHasJoined(true);
    toast.success("เข้าร่วมประชุมสำเร็จ", { description: "คุณได้เข้าร่วมในฐานะบุคคลภายนอก" });
  };

  // หยุดจดจำเสียงเมื่อออกจากคอมโพเนนต์ — กันไมค์ค้างฟังหลัง unmount
  useEffect(() => {
    return () => {
      webSpeechProvider.stop();
    };
  }, []);

  if (!meeting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground">
        <span className="material-symbols-outlined text-red-500 text-5xl mb-2 animate-bounce">error</span>
        <h2 className="text-xl font-bold">ไม่พบการประชุมนี้</h2>
        <Button onClick={() => router.push("/portal")} className="mt-4 bg-primary hover:bg-primary/90">
          กลับสู่พอร์ทัล
        </Button>
      </div>
    );
  }

  // สิทธิ์คุมห้อง — เดิมให้แค่ admin/secretary ทำให้ผู้จัดที่เป็นบทบาทอื่นคุมห้องตัวเองไม่ได้
  const isManager = can(currentUser, "meeting.host", meeting);

  // เข้าห้องได้ในฐานะองค์ประชุมไหม
  const isInvited = can(currentUser, "meeting.join", meeting);
  // ผู้จัดเปิดให้คนนอกเข้าเองได้หรือไม่ (ค่าเริ่มต้นคือปิด)
  const guestJoinAllowed = meeting.allowGuestJoin === true;

  // เอกสารที่ผู้ใช้คนนี้มีสิทธิ์เห็น — ผู้เข้าร่วมดูได้อย่างเดียว ไม่มีดาวน์โหลด
  const visibleFiles = meeting.files.filter((f) => canViewFile(f, currentUser, meeting));

  // เอกสารที่โฮสต์กำลังแชร์ให้ทุกคนดูพร้อมกัน (ถ้าผู้ใช้คนนี้มีสิทธิ์เห็น)
  const sharedFile = sharedFileId ? visibleFiles.find((f) => f.id === sharedFileId) : undefined;

  // การประชุมนี้วิ่งบนแพลตฟอร์มไหน
  const conference = resolveConference(meeting);
  const videoSurface = resolveVideoSurface(meeting);
  const isExternalConference = videoSurface.kind === "external";
  const isEmbedConference = videoSurface.kind === "embed";

  // กันคนที่ไม่ได้ถูกเชิญ — เดิมใครเปิด URL ก็เห็นฟอร์มแล้วเติมชื่อตัวเองเข้า roster ได้เลย
  if (!hasJoined && !isInvited && !guestJoinAllowed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-muted border flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[28px] text-muted-foreground">lock</span>
            </div>
            <CardTitle className="text-lg font-semibold">คุณไม่ได้อยู่ในองค์ประชุมนี้</CardTitle>
            <CardDescription>{meeting.name}</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              ห้องประชุมนี้เปิดเฉพาะผู้ที่ได้รับเชิญ
              หากคุณควรเข้าร่วมได้ กรุณาติดต่อ{" "}
              <span className="font-medium text-foreground">{meeting.organizer}</span> เพื่อขอเพิ่มชื่อ
            </p>
            <Button variant="outline" onClick={() => router.push("/portal")} className="w-full">
              <span className="material-symbols-outlined text-[18px] mr-1.5">arrow_back</span>
              กลับไปหน้าการประชุมของฉัน
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Guest join prompt UI
  if (!hasJoined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-muted border-border text-foreground shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-primary flex items-center justify-center mb-3 shadow-lg shadow-primary/20">
              <span className="material-symbols-outlined text-white text-3xl">groups</span>
            </div>
            <CardTitle className="text-xl font-bold text-foreground">เข้าร่วมการประชุมออนไลน์</CardTitle>
            <CardDescription className="text-muted-foreground">
              {meeting.name} ({meeting.shortName})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-xl border border-border text-xs text-muted-foreground space-y-2">
              <div className="flex justify-between">
                <span>วันที่:</span>
                <span className="text-foreground">{meeting.date}</span>
              </div>
              <div className="flex justify-between">
                <span>เวลา:</span>
                <span className="text-foreground">{meeting.startTime} - {meeting.endTime} น.</span>
              </div>
              <div className="flex justify-between">
                <span>สถานที่/ห้อง:</span>
                <span className="text-foreground">{meeting.location}</span>
              </div>
            </div>

            <form onSubmit={handleGuestJoinSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground block">ชื่อ-นามสกุล ของท่าน</label>
                <Input
                  required
                  placeholder="เช่น นาย สมศักดิ์ รักดี (บุคคลภายนอก)…"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary focus-visible:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground block">บทบาท / หน่วยงานที่เกี่ยวข้อง</label>
                <select
                  value={guestRole}
                  onChange={(e) => setGuestRole(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option>ผู้ทรงคุณวุฒิภายนอก</option>
                  <option>ผู้สังเกตการณ์</option>
                  <option>ผู้แทนหน่วยงานภายนอก</option>
                  <option>ที่ปรึกษาโครงการ</option>
                </select>
              </div>

              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-11 shadow-lg shadow-primary/20 mt-2">
                เข้าร่วมประชุม
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center border-t border-border py-3 bg-muted rounded-b-2xl">
            <button onClick={() => router.push("/portal")} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">arrow_back</span> กลับหน้ารายการ
            </button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Handle chat submission
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const time = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    addChatMessage(meeting.id, {
      sender: localParticipant?.name || currentUser.name,
      text: chatInput.trim(),
      time,
    });
    setChatInput("");
  };

  const handleHandRaise = () => {
    const next = !handRaised;
    broadcastRef.current?.({ type: "hand_raise", payload: { raised: next } });
    setRaisedHands((prev) => {
      const copy = new Map(prev);
      if (next) copy.set(currentUser.id, { userId: currentUser.id, userName: currentUser.name, raisedAt: Date.now() });
      else copy.delete(currentUser.id);
      return copy;
    });
  };

  const handleLowerHand = (userId: string) => {
    broadcastRef.current?.({ type: "hand_lower", payload: { targetUserId: userId } });
    setRaisedHands((prev) => {
      const copy = new Map(prev);
      copy.delete(userId);
      return copy;
    });
  };

  // แชร์เอกสารให้ผู้เข้าร่วมทั้งหมดในห้อง — broadcast แล้วให้ผู้เข้าร่วมคนอื่นตามหน้าจอโฮสต์อัตโนมัติ
  const handleShareFile = (file: MeetingFile) => {
    const isShared = sharedFileId === file.id;
    if (isShared) {
      setSharedFileId(null);
      toast.success("หยุดแชร์เอกสารแล้ว");
      broadcastRef.current?.({ type: "doc_share_stop", payload: {} });
      return;
    }
    setSharedFileId(file.id);
    setSharedViewerPage(1);
    toast.success(`กำลังแชร์: ${file.name}`);
    broadcastRef.current?.({ type: "doc_share", payload: { fileId: file.id, fileName: file.name } });
  };

  // เปลี่ยนหน้าเอกสารที่กำลังแชร์อยู่ — broadcast ให้ผู้เข้าร่วมคนอื่นเลื่อนตาม (เฉพาะตอนกำลังแชร์)
  const handleSharedPageChange = (page: number) => {
    setSharedViewerPage(page);
    if (sharedFileId) {
      broadcastRef.current?.({ type: "doc_share_page", payload: { fileId: sharedFileId, page } });
    }
  };

  const handleToggleSubtitle = () => {
    if (subtitleOn) {
      webSpeechProvider.stop();
      setSubtitleOn(false);
      return;
    }
    if (!webSpeechProvider.isSupported()) {
      toast.error("เบราว์เซอร์ไม่รองรับ กรุณาใช้ Chrome");
      return;
    }
    webSpeechProvider.start(
      "th-TH",
      (result) => {
        const signal: RoomSignal<"subtitle_text"> = {
          type: "subtitle_text",
          senderId: currentUser.id,
          senderName: currentUser.name,
          timestamp: Date.now(),
          payload: { text: result.text, isFinal: result.isFinal, lang: result.lang },
        };
        broadcastRef.current?.({ type: "subtitle_text", payload: signal.payload });
        // BroadcastChannel ไม่ส่งข้อความกลับมาหาผู้ส่งเอง — ต้องเซ็ต latestSubtitle ในเครื่องนี้เองด้วย
        // ไม่งั้นคนที่พูดจะไม่เห็นซับไตเติลของตัวเอง (ดู Fix 1)
        setLatestSubtitle(signal);
        if (result.isFinal) {
          appendSegment(meeting.id, {
            speakerId: currentUser.id,
            speakerName: currentUser.name,
            startSec: (Date.now() - meetingStartRef.current) / 1000,
            text: result.text,
          });
        }
      },
      (reason) => {
        // recognition หยุดทำงานเอง — ทำให้ปุ่ม CC สะท้อนสถานะจริงแทนที่จะค้างเป็น "on" เฉย ๆ (ดู Fix 5)
        setSubtitleOn(false);
        if (reason === "not-allowed") {
          toast.error("ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน");
        } else {
          toast.error("ซับไตเติลหยุดทำงาน");
        }
      }
    );
    setSubtitleOn(true);
  };

  return (
    <RoomSignalingProvider meetingId={meeting.id}>
    <RoomSignalBridge
      currentUserId={currentUser.id}
      meetingId={meeting.id}
      meetingStartRef={meetingStartRef}
      broadcastRef={broadcastRef}
      setRaisedHands={setRaisedHands}
      setLatestSubtitle={setLatestSubtitle}
      setSharedFileId={setSharedFileId}
      setSharedViewerPage={setSharedViewerPage}
      isFileVisible={(fileId) => visibleFiles.some((f) => f.id === fileId)}
      setVoteRefreshToken={setVoteRefreshToken}
    />
    <div className="fixed inset-0 bg-background text-foreground flex flex-col font-sans overflow-hidden z-[1000]">
      {/* Top Header */}
      <header className="h-14 bg-card border-b border-border px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-7 w-7 rounded bg-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-white text-base">videocam</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold truncate text-foreground">{meeting.name}</h2>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
              <span>{meeting.location}</span>
              <span>•</span>
              <span className="flex items-center text-red-500 font-semibold gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-600 animate-ping motion-reduce:animate-none"></span>
                LIVE {meeting.participants.filter(p => p.present).length} คนในสาย
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Active Agenda Banner */}
          {meeting.activeAgendaId && (
            <div className="hidden md:flex items-center gap-1.5 bg-primary/10 border border-primary/40 px-3 py-1 rounded-full">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
              <span className="text-[10px] text-primary font-semibold truncate max-w-[240px]">
                หัวข้อกำลังพูดคุย: {meeting.agenda.find(a => a.id === meeting.activeAgendaId)?.title}
              </span>
            </div>
          )}

          {/* End Meeting Button (Host only) */}
          {isManager && meeting.status === "in_progress" && (
            <Button
              size="sm"
              onClick={() => {
                // Force all participants out
                const updatedParticipants = meeting.participants.map((p) => ({
                  ...p,
                  present: false,
                }));
                updateMeeting(meeting.id, { participants: updatedParticipants, status: "waiting_endorse" });
                toast.success("จบการประชุมแล้ว", {
                  description: "สามารถขอ Transcript ได้ที่หน้าจัดการประชุม"
                });
                // Delay before redirecting to allow notification
                setTimeout(() => router.push("/meetings/" + meeting.id), 1500);
              }}
              className="h-8 font-semibold bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-3"
              title="จบการประชุมสำหรับทุกคน"
            >
              <span className="material-symbols-outlined text-[16px] mr-1">stop_circle</span>
              จบการประชุมเลย
            </Button>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              // Lower own raised hand for everyone else before leaving
              if (raisedHands.has(currentUser.id)) {
                broadcastRef.current?.({ type: "hand_raise", payload: { raised: false } });
                setRaisedHands((prev) => {
                  const copy = new Map(prev);
                  copy.delete(currentUser.id);
                  return copy;
                });
              }
              // Set present false in context on leave
              if (localParticipant) {
                const updatedParticipants = meeting.participants.map((p) =>
                  p.id === localParticipant.id ? { ...p, present: false } : p
                );
                updateMeeting(meeting.id, { participants: updatedParticipants });
              }
              toast.info("คุณได้ออกจากห้องประชุมเรียบร้อย");
              router.push("/portal");
            }}
            className="h-8 font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg px-3"
          >
            <span className="material-symbols-outlined text-[16px] mr-1">logout</span>
            ออกจากห้องประชุม
          </Button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        
        {/* Left Side: Video Grid & Shared Presentation */}
        <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto relative">
          
          {/* Main content pane: เอกสารที่แชร์ > engine ฝัง (ZegoCloud) > เวทีประชุมภายนอก
              ไม่มีห้องจำลอง (mockup) ให้ fallback แล้ว — ทุก meeting ต้องผ่าน engine จริงหรือลิงก์จริง */}
          {isEmbedConference && !sharedFile ? (
            <ZegoCloudEmbedStage
              meeting={meeting}
              isHost={isManager}
              credential={videoCredential}
              credentialError={credentialError}
              userId={roomIdentityId}
              displayName={roomIdentityName}
              onLeave={() => {
                if (raisedHands.has(currentUser.id)) {
                  broadcastRef.current?.({ type: "hand_raise", payload: { raised: false } });
                  setRaisedHands((prev) => {
                    const copy = new Map(prev);
                    copy.delete(currentUser.id);
                    return copy;
                  });
                }
                if (localParticipant) {
                  const updatedParticipants = meeting.participants.map((p) =>
                    p.id === localParticipant.id ? { ...p, present: false } : p
                  );
                  updateMeeting(meeting.id, { participants: updatedParticipants });
                }
                toast.info("คุณได้ออกจากห้องประชุม ZegoCloud เรียบร้อย");
                router.push("/portal");
              }}
            />
          ) : isExternalConference && !sharedFile ? (
            <ExternalConferenceStage conference={conference} meetingName={meeting.name} />
          ) : sharedFile ? (
            <div className="flex-1 min-h-[300px] border border-border rounded-2xl bg-card overflow-hidden flex flex-col relative">
              <div className="bg-muted px-4 py-2 border-b border-border flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-primary">present_to_all</span>
                  {isManager ? "คุณกำลังแชร์เอกสารนี้ให้ผู้เข้าร่วมทั้งหมด" : `${meeting.organizer} กำลังแชร์หน้าจอเอกสาร`}
                </span>
                {isManager && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-6 text-destructive hover:text-red-300 hover:bg-secondary"
                    onClick={() => {
                      setSharedFileId(null);
                      broadcastRef.current?.({ type: "doc_share_stop", payload: {} });
                    }}
                  >
                    หยุดการแชร์เอกสาร
                  </Button>
                )}
              </div>
              <div className="flex-1 p-6 flex flex-col justify-between overflow-y-auto">
                {/* Renders simulated document view */}
                <SimulatedDocumentViewer
                  file={sharedFile}
                  currentPage={sharedViewerPage}
                  setCurrentPage={isManager ? handleSharedPageChange : setSharedViewerPage}
                  zoom={viewerZoom}
                  setZoom={setViewerZoom}
                />
              </div>
            </div>
          ) : (
            /* ไม่มีห้องประชุมจำลองให้ fallback อีกต่อไป — ทุก meeting ต้องแก้ปัญหาผ่าน engine จริง
               (ZegoCloud) หรือลิงก์ภายนอก ถ้าตกมาถึง branch นี้แปลว่า resolveVideoSurface
               คืนค่าที่ไม่รู้จัก ให้บอกตรงๆ แทนการแสดงวิดีโอปลอม */
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2 border border-dashed border-border rounded-2xl">
              <span className="material-symbols-outlined text-4xl">videocam_off</span>
              <p>ไม่สามารถระบุช่องทางวิดีโอของการประชุมนี้ได้</p>
            </div>
          )}

          {/* แถบควบคุมฟีเจอร์ห้องประชุม — ยกมือ/ซับไตเติล ใช้ได้ทุกโหมด ไม่ผูกกับ engine วิดีโอ
              (ไมค์/กล้องคุมผ่าน UI ของ engine เอง เช่น ZegoCloudEmbedStage — ไม่ซ้ำปุ่มที่นี่) */}
          <div className="h-16 bg-card border border-border rounded-2xl items-center justify-center gap-2 sm:gap-4 px-4 shrink-0 shadow-lg flex">
            <Button
              onClick={handleHandRaise}
              size="icon"
              className={`rounded-xl h-10 w-10 border transition-all ${
                handRaised
                  ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                  : "bg-secondary border-border text-foreground hover:bg-secondary/80"
              }`}
              title="Raise Hand"
            >
              <span className="material-symbols-outlined text-[20px]">{handRaised ? "pan_tool" : "pan_tool_alt"}</span>
            </Button>

            <Button
              onClick={handleToggleSubtitle}
              size="icon"
              className={`rounded-xl h-10 w-10 border transition-all ${
                subtitleOn
                  ? "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20"
                  : "bg-secondary border-border text-foreground hover:bg-secondary/80"
              }`}
              title="คำบรรยายสด (Subtitle)"
            >
              <span className="material-symbols-outlined text-[20px]">closed_caption</span>
            </Button>
          </div>

          <SubtitleBar latest={latestSubtitle} />
        </div>

        {/* Right Side: Tab Drawers for Agenda, Files, Chat, and Participants */}
        <div className="w-80 md:w-96 bg-card border-l border-border flex flex-col shrink-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-3 pt-3 border-b border-border bg-muted flex shrink-0">
              <TabsList className="bg-muted border border-border p-0.5 rounded-lg flex-1 h-9">
                <TabsTrigger value="agenda" className="text-xs data-[state=active]:bg-secondary rounded-md py-1.5 flex-1">
                  วาระ
                </TabsTrigger>
                <TabsTrigger value="files" className="text-xs data-[state=active]:bg-secondary rounded-md py-1.5 flex-1">
                  เอกสาร
                </TabsTrigger>
                <TabsTrigger value="chat" className="text-xs data-[state=active]:bg-secondary rounded-md py-1.5 flex-1">
                  แชท
                </TabsTrigger>
                <TabsTrigger value="people" className="text-xs data-[state=active]:bg-secondary rounded-md py-1.5 flex-1">
                  ผู้ร่วม
                </TabsTrigger>
                <TabsTrigger value="vote" className="text-xs data-[state=active]:bg-secondary rounded-md py-1.5 flex-1">
                  โหวต
                </TabsTrigger>
              </TabsList>
            </div>

            {/* AGENDA CONTENT */}
            <TabsContent value="agenda" className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 mt-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">ระเบียบวาระการประชุม</h3>
                {isManager && (
                  <Badge className="bg-muted border border-border text-indigo-700 text-[9px] py-0 px-2">
                    สิทธิ์โฮสต์ (Host)
                  </Badge>
                )}
              </div>

              {meeting.agenda.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-xs">ไม่มีวาระการประชุม</div>
              ) : (
                <div className="space-y-2">
                  {meeting.agenda.map((ag) => {
                    const isActive = meeting.activeAgendaId === ag.id;
                    return (
                      <div
                        key={ag.id}
                        className={`rounded-xl border p-3 transition-all ${
                          isActive
                            ? "bg-primary/10 border-primary/50 shadow-md shadow-primary/10"
                            : "bg-muted border-border"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              <Badge className={`text-[9px] py-0 ${isActive ? "bg-primary text-white" : "bg-card border border-border text-muted-foreground"}`}>
                                วาระ {ag.no}
                              </Badge>
                              {isActive && (
                                <span className="text-[9px] text-primary font-bold animate-pulse flex items-center gap-0.5">
                                  <span className="material-symbols-outlined text-[10px]">volume_up</span> กำลังพูดคุย
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-bold text-foreground leading-tight">{ag.title}</p>
                            {ag.detail && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{ag.detail}</p>}
                          </div>

                          {isManager && (
                            <Button
                              onClick={() => updateActiveAgenda(meeting.id, isActive ? null : ag.id)}
                              size="xs"
                              variant="outline"
                              className={`text-[9px] font-semibold h-6 shrink-0 ${
                                isActive
                                  ? "bg-primary/15 border-primary/50 text-primary hover:bg-primary/20"
                                  : "border-border hover:bg-card text-foreground"
                              }`}
                            >
                              {isActive ? "ปลดโฟกัส" : "เริ่มวาระ"}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* DOCUMENTS TAB CONTENT */}
            <TabsContent value="files" className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 mt-0">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">เอกสารประกอบการประชุม</h3>

              {visibleFiles.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-xs">ไม่มีไฟล์เอกสารแนบ</div>
              ) : (
                <div className="space-y-2">
                  {visibleFiles.map((file) => {
                    const isShared = sharedFileId === file.id;
                    return (
                      <div
                        key={file.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setViewingFile(file);
                          setLightboxPage(1);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setViewingFile(file);
                            setLightboxPage(1);
                          }
                        }}
                        className={`rounded-xl border bg-muted p-3 hover:border-border cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                          viewingFile?.id === file.id ? "border-primary/50" : "border-border"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-card border border-border flex items-center justify-center text-primary shrink-0">
                            <span className="material-symbols-outlined">
                              {file.name.endsWith(".pdf") ? "picture_as_pdf" : "description"}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate text-foreground">{file.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{file.description || "ไม่มีคำอธิบาย"}</p>
                            <p className="text-[9px] text-muted-foreground mt-1">{file.size} · อัปโหลดโดย: {file.uploadedBy}</p>
                          </div>
                        </div>

                        {/* Document controls */}
                        <div className="flex justify-end gap-1.5 mt-2.5 pt-2 border-t border-border">
                          {isManager && (
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShareFile(file);
                              }}
                              size="xs"
                              variant="ghost"
                              className={`h-6 text-[10px] ${isShared ? "text-destructive hover:bg-card" : "text-indigo-700 hover:bg-card"}`}
                            >
                              <span className="material-symbols-outlined text-[14px] mr-1">present_to_all</span>
                              {isShared ? "หยุดแชร์" : "แชร์หน้าจอ"}
                            </Button>
                          )}
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingFile(file);
                              setLightboxPage(1);
                            }}
                            size="xs"
                            variant="ghost"
                            className="h-6 text-foreground hover:bg-card text-[10px]"
                          >
                            <span className="material-symbols-outlined text-[14px] mr-1">menu_book</span>
                            อ่านในเว็บ
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* CHAT TAB CONTENT */}
            <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 mt-0 bg-muted/40">
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                <div className="text-center py-2 text-[10px] text-muted-foreground">
                  ยินดีต้อนรับสู่ห้องแชทสำหรับการประชุมออนไลน์
                </div>
                
                {/* Mock historical messages */}
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-primary">นางสาว มาลี รักษาสัตย์</span>
                  <div className="bg-card border border-border p-2.5 rounded-2xl rounded-tl-none text-xs text-foreground">
                    สวัสดีค่ะ คณะกรรมการทุกท่าน เอกสารแนบได้อัปโหลดลงในระบบครบถ้วนแล้วนะคะ
                  </div>
                  <span className="text-[9px] text-muted-foreground text-right block pr-1">12:55</span>
                </div>

                {meeting.chatMessages?.map((msg) => {
                  const isMe = msg.sender === (localParticipant?.name || currentUser.name);
                  return (
                    <div key={msg.id} className="space-y-1">
                      <span className={`text-[10px] font-semibold block ${isMe ? "text-indigo-700 text-right pr-1" : "text-primary"}`}>
                        {msg.sender}
                      </span>
                      <div className={`p-2.5 rounded-2xl border text-xs max-w-[85%] ${
                        isMe 
                          ? "bg-secondary border-border text-foreground ml-auto rounded-tr-none" 
                          : "bg-card border-border text-foreground rounded-tl-none"
                      }`}>
                        {msg.text}
                      </div>
                      <span className={`text-[9px] text-muted-foreground block ${isMe ? "text-right pr-1" : "pl-1"}`}>
                        {msg.time}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Chat Input block */}
              <form onSubmit={handleSendChat} className="p-3 border-t border-border bg-card flex gap-2 shrink-0">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="พิมพ์ข้อความที่นี่…"
                  className="bg-muted border-border text-xs text-foreground"
                />
                <Button type="submit" size="sm" className="bg-primary hover:bg-primary/90 text-white shrink-0">
                  ส่ง
                </Button>
              </form>
            </TabsContent>

            {/* PEOPLE TAB CONTENT */}
            <TabsContent value="people" className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 mt-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">รายชื่อผู้เข้าร่วมประชุม</h3>
                <Badge className="bg-card border border-border text-muted-foreground text-[9px] py-0 px-2">
                  มาเข้าร่วม {meeting.participants.filter(p => p.present || p.id === localParticipant?.id).length} คน
                </Badge>
              </div>

              <HandRaiseList raised={[...raisedHands.values()]} isHost={isManager} onLower={handleLowerHand} />

              <div className="space-y-2">
                {/* Local user */}
                <div className="rounded-xl border border-border bg-muted p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {localParticipant?.name.split(" ")[1]?.charAt(0) || "U"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate text-foreground">
                        {localParticipant?.name || currentUser.name} (คุณ)
                      </p>
                      <p className="text-[9px] text-muted-foreground truncate">{localParticipant?.position || currentUser.position}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {handRaised && <span className="material-symbols-outlined text-amber-500 text-[14px] animate-bounce">pan_tool</span>}
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="text-[9px] text-muted-foreground">เข้าชม</span>
                  </div>
                </div>

                {/* Rest of the participant roster */}
                {meeting.participants
                  .filter((p) => p.id !== localParticipant?.id)
                  .map((p) => {
                    const isPresent = p.present;
                    const raised = p.userId ? raisedHands.has(p.userId) : false;
                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border p-2.5 flex items-center justify-between transition-opacity ${
                          isPresent ? "border-border bg-muted" : "border-border opacity-40 bg-muted/20"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 ${
                            isPresent ? "bg-secondary border-border text-foreground" : "bg-card border-border text-muted-foreground"
                          }`}>
                            {p.name.split(" ")[1]?.charAt(0) || p.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate text-foreground">{p.name}</p>
                            <p className="text-[9px] text-muted-foreground truncate">{p.position} {!p.inSystem && "· ภายนอก"}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {raised && <span className="material-symbols-outlined text-amber-500 text-[14px] animate-bounce">pan_tool</span>}
                          <span className={`h-1.5 w-1.5 rounded-full ${isPresent ? "bg-green-500" : "bg-muted-foreground/40"}`}></span>
                          <span className="text-[9px] text-muted-foreground">{isPresent ? "เข้าชม" : "ออฟไลน์"}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </TabsContent>

            <TabsContent value="vote" className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 mt-0">
              <VotePanel
                meetingId={meeting.id}
                canManage={can(currentUser, "meeting.manageVoting", meeting)}
                voteRefreshToken={voteRefreshToken}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Embedded Document Viewer Lightbox — อ่านอย่างเดียว */}
      {viewingFile && (
        <DocumentLightbox
          file={viewingFile}
          onClose={() => setViewingFile(null)}
          currentPage={lightboxPage}
          setCurrentPage={setLightboxPage}
          zoom={viewerZoom}
          setZoom={setViewerZoom}
          viewerName={currentUser.name}
          confidentialityLevel={meeting.confidentialityLevel ?? "normal"}
        />
      )}
    </div>
    </RoomSignalingProvider>
  );
}
