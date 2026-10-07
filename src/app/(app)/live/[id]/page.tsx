"use client";

import { useState, useEffect, useRef, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useMeetings } from "@/context/MeetingContext";
import { useCurrentUser } from "@/context/UserContext";
import { RoomSignalingProvider } from "@/context/RoomSignalingContext";
import { RoomSignalBridge, type Broadcast } from "./RoomSignalBridge";
import { HandRaiseList } from "@/components/meeting/HandRaiseList";
import { DocumentContent, DocumentLightbox, DocumentWatermark } from "@/components/meeting/DocumentPreview";
import { ExternalConferenceStage } from "@/components/meeting/ExternalConferenceStage";
import { ZegoCloudEmbedStage } from "@/components/meeting/ZegoCloudEmbedStage";
import { SubtitleBar } from "@/components/meeting/SubtitleBar";
import { VotePanel } from "@/components/meeting/VotePanel";
import { ConfidentialityGate } from "@/components/meeting/ConfidentialityGate";
import { PageError, PageLoading } from "@/components/layout/PageState";
import { resolveConference } from "@/lib/conference";
import { resolveVideoSurface } from "@/services/video";
import { requestVideoCredential, type VideoCredential } from "@/services/credentials";
import { isCaptureSupported, startCapture } from "@/services/speech/audioCapture";
import { fetchRoomSnapshot } from "@/services/rooms/snapshot";
import type { RoomSignal, RaisedHandDto, ChatMessageDto } from "@/services/signaling/types";
import { can } from "@/lib/authz";
import { getHomeRoute } from "@/lib/access";
import { MeetingParticipant, MeetingFile, canViewFile } from "@/data";

type RoomState = RoomSignal<"room_state">["payload"];

export default function LiveMeetingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { meetings, loading, error, reload, updateMeeting, updateActiveAgenda, patchLocal } = useMeetings();
  const { currentUser, signOut } = useCurrentUser();

  const meeting = meetings.find((m) => m.id === id);

  // server เป็นเจ้าของสถานะมือที่ยกอยู่: ส่งเจตนา (hand_raise/hand_lower) แล้วรอ hand_state
  // กลับมาทับของเดิม ไม่มีการอัปเดตแบบ optimistic ในเครื่องนี้
  const [raisedHands, setRaisedHands] = useState<RaisedHandDto[]>([]);
  const handRaised = raisedHands.some((h) => h.userId === currentUser.id);
  const broadcastRef = useRef<Broadcast | null>(null);
  // snapshot fetch กับสัญญาณสด (hand_state/doc_share_state) แข่งกันได้โดยไม่มีการรับประกันลำดับ —
  // ถ้าสัญญาณสดมาถึงก่อน snapshot ตอบกลับ ต้องไม่ให้ snapshot ที่เก่ากว่ามาทับ
  const handSignalReceivedRef = useRef(false);
  const docShareSignalReceivedRef = useRef(false);
  const [subtitleOn, setSubtitleOn] = useState(false);
  const [latestSubtitle, setLatestSubtitle] = useState<RoomSignal<"subtitle_text"> | null>(null);
  // ค่าเริ่มต้นใช้เวลาที่เปิดหน้านี้ไปก่อน แล้ว RoomSignalBridge เขียนทับด้วยเวลาเริ่มห้องจริง
  // ที่ server ส่งมาตอน room_joined
  const meetingStartRef = useRef(Date.now());
  const sendAudioRef = useRef<((frame: ArrayBuffer) => void) | null>(null);
  // ฟังก์ชันหยุดจับเสียงที่ startCapture คืนมา — เก็บไว้เพื่อปิดไมค์ตอนกดปิดซับหรือออกจากห้อง
  const stopCaptureRef = useRef<(() => void) | null>(null);
  const startingCaptureRef = useRef(false);
  const [activeTab, setActiveTab] = useState("agenda");
  const [chatInput, setChatInput] = useState("");
  // คนที่ต่อห้องอยู่จริงตามที่ server ประกาศ — ใช้แทน participant.present ที่ต้องเขียนลงการประชุม
  const [connectedUserIds, setConnectedUserIds] = useState<string[]>([]);
  const [connectionFailed, setConnectionFailed] = useState(false);

  const [viewingFile, setViewingFile] = useState<MeetingFile | null>(null);
  const [sharedFileId, setSharedFileId] = useState<string | null>(null);
  // VotePanel อ่าน snapshot โหวตจาก server ตอน mount และทุกครั้งที่ตัวนับนี้เปลี่ยน — คนที่เข้าห้องทีหลัง
  // จึงเห็นหัวข้อโหวตที่มีอยู่ก่อนหน้าด้วย ส่วนการอัปเดตสดมาทาง vote_state ที่ VotePanel ฟังเอง
  const [voteRefreshToken, setVoteRefreshToken] = useState(0);

  // Credential สำหรับ engine ฝัง — null = เข้าห้องจริงไม่ได้ พร้อมเหตุผลใน credentialError
  const [videoCredential, setVideoCredential] = useState<VideoCredential | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);

  const isGuest = currentUser.id.startsWith("guest-");
  const canJoin = meeting ? isGuest || can(currentUser, "meeting.join", meeting) : false;
  // ต้องยอมรับข้อตกลงรักษาความลับทุกครั้งที่เข้าห้อง — ก่อนนั้นยังไม่ต่อวิดีโอ/สัญญาณ/สถานะห้องใดๆ
  const [consented, setConsented] = useState(false);
  const inRoom = canJoin && consented;

  // ตัวตนในห้องประชุม — ผู้ที่อยู่ในรายชื่อใช้แถวของตัวเอง คนอื่นที่มีสิทธิ์เข้า (ผู้จัด ผู้รับมอบสิทธิ์
  // admin จอหน้าห้อง แขกจากลิงก์เชิญ) ใช้ตัวตนชั่วคราวที่ไม่ถูกเขียนกลับเข้ารายชื่อองค์ประชุม
  // (ถ้าเขียนกลับ ทุกครั้งที่ผู้จัดเปิดดูจะถูกนับเป็นองค์ประชุมถาวร)
  const listedParticipant = meeting?.participants.find((p) => p.userId !== null && p.userId === currentUser.id);
  const localParticipant: MeetingParticipant | null = !meeting || !canJoin
    ? null
    : listedParticipant ?? {
        id: `P-visitor-${currentUser.id}`,
        userId: currentUser.id,
        name: currentUser.name,
        position: currentUser.position,
        role: currentUser.position,
        department: currentUser.department,
        email: currentUser.email,
        attendance: "attend",
        present: true,
        inSystem: !isGuest,
      };

  useEffect(() => {
    if (!meeting || !inRoom) return;
    const surface = resolveVideoSurface(meeting);
    if (surface.kind !== "embed") return;
    let cancelled = false;
    setVideoCredential(null);
    setCredentialError(null);
    requestVideoCredential(surface.engineId, meeting.id).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setVideoCredential(result.credential);
      } else {
        setCredentialError(result.reason);
      }
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting?.id, inRoom]);

  // คนที่เข้าห้องทีหลังต้องได้สถานะปัจจุบันทั้งก้อนก่อน — ดึง snapshot ครั้งเดียวตอนห้อง mount
  // แล้วค่อยฟังสัญญาณ live ต่อ (RoomSignalBridge) ไม่งั้นจะไม่เห็นมือที่ยกอยู่/เอกสารที่แชร์ค้างไว้ก่อนหน้า
  useEffect(() => {
    if (!meeting || !inRoom) return;
    let cancelled = false;
    fetchRoomSnapshot(meeting.id).then((snapshot) => {
      if (cancelled) return;
      if (snapshot.failed) {
        toast.error("โหลดสถานะห้องประชุมไม่สำเร็จ — มือที่ยก เอกสารที่แชร์ และโหวตอาจยังไม่ครบ");
        return;
      }
      if (!handSignalReceivedRef.current) setRaisedHands(snapshot.raisedHands);
      if (!docShareSignalReceivedRef.current) setSharedFileId(snapshot.docShare?.fileId ?? null);
      setVoteRefreshToken((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting?.id, inRoom]);

  // หยุดจับเสียงเมื่อออกจากคอมโพเนนต์ — กันไมค์ค้างฟังหลัง unmount
  useEffect(() => {
    return () => {
      stopCaptureRef.current?.();
      stopCaptureRef.current = null;
    };
  }, []);

  const meetingId = meeting?.id;
  const isHost = meeting ? can(currentUser, "meeting.host", meeting) : false;

  const handleChatMessage = useCallback(
    (message: ChatMessageDto) => {
      if (!meetingId) return;
      patchLocal(meetingId, (m) =>
        m.chatMessages?.some((c) => c.id === message.id)
          ? m
          : { ...m, chatMessages: [...(m.chatMessages ?? []), message] }
      );
    },
    [meetingId, patchLocal]
  );

  // server ประกาศสถานะจาก DB — วาระที่กำลังพูด, การจบประชุม และรายชื่อคนที่ต่ออยู่
  const handleRoomState = useCallback(
    (state: RoomState) => {
      if (!meetingId) return;
      setConnectedUserIds(state.connectedUserIds);
      let ended = false;
      patchLocal(meetingId, (m) => {
        ended = m.status === "in_progress" && state.status === "waiting_endorse";
        return {
          ...m,
          ...(state.status ? { status: state.status as typeof m.status } : {}),
          activeAgendaId: state.activeAgendaId,
        };
      });
      if (ended && !isHost) {
        toast.info("ผู้จัดประชุมได้ปิดห้องประชุมแล้ว", { description: "กรุณาออกจากห้องประชุม", duration: 5000 });
      }
    },
    [meetingId, patchLocal, isHost]
  );

  if (!meeting) {
    if (loading) return <PageLoading label="กำลังเข้าห้องประชุม..." className="min-h-dvh" />;
    if (error) return <PageError message={error} onRetry={() => void reload()} className="min-h-dvh" />;
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-background text-foreground px-4 text-center">
        <span className="material-symbols-outlined text-destructive text-5xl">error</span>
        <h2 className="text-xl font-bold">ไม่พบการประชุมนี้</h2>
        <p className="text-sm text-muted-foreground">การประชุมอาจถูกลบไปแล้ว หรือคุณไม่มีสิทธิ์เข้าถึง</p>
        <Button onClick={() => router.push(getHomeRoute(currentUser.systemRole))}>กลับหน้าหลัก</Button>
      </div>
    );
  }

  // กันคนที่ไม่ได้ถูกเชิญ — บุคคลภายนอกต้องเข้าผ่านลิงก์เชิญเท่านั้น ไม่มีฟอร์มกรอกชื่อเข้าเองแล้ว
  // (ฟอร์มเดิมเขียนชื่อลงรายชื่อด้วยสิทธิ์ที่ server ไม่ให้ แล้วขึ้นว่าเข้าร่วมสำเร็จทั้งที่ถูกปฏิเสธ)
  if (!localParticipant) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-muted border flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-3xl text-muted-foreground">lock</span>
            </div>
            <CardTitle className="text-lg font-semibold">คุณไม่ได้อยู่ในองค์ประชุมนี้</CardTitle>
            <CardDescription>{meeting.name}</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              ห้องประชุมนี้เปิดเฉพาะผู้ที่ได้รับเชิญ หากคุณควรเข้าร่วมได้ กรุณาติดต่อ{" "}
              <span className="font-medium text-foreground">{meeting.organizer}</span>{" "}
              เพื่อขอเพิ่มชื่อหรือขอลิงก์เชิญ
            </p>
            <Button variant="outline" onClick={() => router.push(getHomeRoute(currentUser.systemRole))} className="w-full">
              <span className="material-symbols-outlined text-lg mr-1.5">arrow_back</span>
              กลับหน้าหลัก
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!consented) {
    return (
      <ConfidentialityGate
        meetingId={meeting.id}
        meetingName={meeting.name}
        onAccepted={() => setConsented(true)}
        onCancel={() => {
          if (isGuest) {
            signOut();
            window.location.assign("/?reason=left");
            return;
          }
          router.push(getHomeRoute(currentUser.systemRole));
        }}
      />
    );
  }

  const isManager = isHost;

  // เอกสารที่ผู้ใช้คนนี้มีสิทธิ์เห็น — ผู้เข้าร่วมดูได้อย่างเดียว ไม่มีดาวน์โหลด
  const visibleFiles = meeting.files.filter((f) => canViewFile(f, currentUser, meeting));
  // เอกสารที่โฮสต์กำลังแชร์ให้ทุกคนดูพร้อมกัน (ถ้าผู้ใช้คนนี้มีสิทธิ์เห็น)
  const sharedFile = sharedFileId ? visibleFiles.find((f) => f.id === sharedFileId) : undefined;

  const conference = resolveConference(meeting);
  const videoSurface = resolveVideoSurface(meeting);
  const isExternalConference = videoSurface.kind === "external";
  const isEmbedConference = videoSurface.kind === "embed";

  const isOnline = (userId: string | null) => (userId ? connectedUserIds.includes(userId) : false);
  const onlineCount = new Set([currentUser.id, ...connectedUserIds]).size;

  // แชทผ่าน WebSocket — server เติมชื่อผู้ส่งและเวลาเอง บันทึกลงการประชุม แล้วกระจายให้ทุกคน
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    if (connectionFailed || !broadcastRef.current) {
      toast.error("ยังไม่ได้เชื่อมต่อห้องประชุม ส่งข้อความไม่ได้");
      return;
    }
    broadcastRef.current({ type: "chat_send", payload: { text } });
    setChatInput("");
  };

  // server เป็นเจ้าของสถานะมือที่ยกอยู่: ส่งเจตนาไปเท่านั้น แล้วรอ hand_state กลับมาทับของเดิม
  const toggleMyHand = (next: boolean) => broadcastRef.current?.({ type: "hand_raise", payload: { raised: next } });
  const lowerOther = (targetUserId: string) => broadcastRef.current?.({ type: "hand_lower", payload: { targetUserId } });

  const handleShareFile = (file: MeetingFile) => {
    if (sharedFileId === file.id) {
      setSharedFileId(null);
      toast.success("หยุดแชร์เอกสารแล้ว");
      broadcastRef.current?.({ type: "doc_share_stop", payload: {} });
      return;
    }
    setSharedFileId(file.id);
    toast.success(`กำลังแชร์: ${file.name}`);
    broadcastRef.current?.({ type: "doc_share", payload: { fileId: file.id, fileName: file.name } });
  };

  // บันทึกผ่าน REST แล้วขอให้ server ประกาศสถานะใหม่ให้ทุกคนในห้อง — เดิมบันทึกอย่างเดียว
  // ผู้เข้าร่วมคนอื่นจึงไม่เคยเห็นวาระที่เปลี่ยนหรือรู้ว่าการประชุมจบแล้ว
  const announce = () => broadcastRef.current?.({ type: "meeting_refresh", payload: {} });

  const handleSetAgenda = async (agendaId: string | null) => {
    if (await updateActiveAgenda(meeting.id, agendaId)) announce();
  };

  const handleEndMeeting = async () => {
    if (!(await updateMeeting(meeting.id, { status: "waiting_endorse" }))) return;
    announce();
    toast.success("จบการประชุมแล้ว", { description: "สร้างร่างรายงานสรุปได้ที่หน้าจัดการประชุม" });
    setTimeout(() => router.push("/meetings/" + meeting.id), 1500);
  };

  const leaveRoom = () => {
    if (handRaised) toggleMyHand(false);
    stopCaptureRef.current?.();
    stopCaptureRef.current = null;
    // แขกมีสิทธิ์แค่ห้องนี้ห้องเดียว — หน้ารายการประชุมไม่มีอะไรให้เขา จะกลับเข้ามาใช้ลิงก์เชิญเดิมได้
    if (isGuest) {
      signOut();
      window.location.assign("/?reason=left");
      return;
    }
    toast.info("คุณได้ออกจากห้องประชุมเรียบร้อย");
    router.push(getHomeRoute(currentUser.systemRole));
  };

  const handleToggleSubtitle = async () => {
    if (subtitleOn) {
      stopCaptureRef.current?.();
      stopCaptureRef.current = null;
      setSubtitleOn(false);
      return;
    }

    if (!isCaptureSupported()) {
      toast.error("เบราว์เซอร์นี้ไม่รองรับการจับเสียงไมค์สำหรับคำบรรยาย");
      return;
    }

    // subtitleOn ยังไม่เป็น true จนกว่า startCapture จะเสร็จ ระหว่างนั้นหน้าต่างขอสิทธิ์ไมค์
    // ค้างอยู่และปุ่มยังกดได้ ถ้ากดซ้ำจะได้ capture สองชุด แล้วชุดแรกไม่มีใครถือฟังก์ชันหยุดไว้
    if (startingCaptureRef.current) return;
    startingCaptureRef.current = true;

    try {
      // เสียงถูกถอดที่ server แล้วส่ง subtitle_text กลับมาให้ทุกคนรวมทั้งผู้พูดเอง
      stopCaptureRef.current = await startCapture({
        sendAudio: (frame) => sendAudioRef.current?.(frame),
        startedAt: meetingStartRef.current,
      });
      setSubtitleOn(true);
    } catch {
      toast.error("เปิดไมค์ไม่สำเร็จ กรุณาอนุญาตการใช้ไมโครโฟนในเบราว์เซอร์");
    } finally {
      startingCaptureRef.current = false;
    }
  };

  const activeAgendaTitle = meeting.agenda.find((a) => a.id === meeting.activeAgendaId)?.title;

  return (
    <RoomSignalingProvider meetingId={meeting.id}>
    <RoomSignalBridge
      currentUserId={currentUser.id}
      broadcastRef={broadcastRef}
      sendAudioRef={sendAudioRef}
      meetingStartRef={meetingStartRef}
      setRaisedHands={setRaisedHands}
      setLatestSubtitle={setLatestSubtitle}
      setSharedFileId={setSharedFileId}
      handSignalReceivedRef={handSignalReceivedRef}
      docShareSignalReceivedRef={docShareSignalReceivedRef}
      onChatMessage={handleChatMessage}
      onRoomState={handleRoomState}
      onConnectionFailed={setConnectionFailed}
    />
    <div className="fixed inset-0 bg-background text-foreground flex flex-col font-sans overflow-hidden z-[1000] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* Top Header */}
      <header className="h-14 bg-card border-b border-border px-4 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-7 w-7 rounded bg-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary-foreground text-base">videocam</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold truncate text-foreground">{meeting.name}</h2>
            <div className="flex items-center gap-2 text-tiny text-muted-foreground mt-0.5 min-w-0">
              <span className="truncate">{meeting.location}</span>
              <span>•</span>
              <span className="flex items-center text-destructive font-semibold gap-1 shrink-0">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive animate-ping motion-reduce:animate-none"></span>
                LIVE {onlineCount} คนในสาย
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activeAgendaTitle && (
            <div className="hidden md:flex items-center gap-1.5 bg-primary/10 border border-primary/40 px-3 py-1 rounded-full">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
              <span className="text-tiny text-primary font-semibold truncate max-w-60">
                หัวข้อกำลังพูดคุย: {activeAgendaTitle}
              </span>
            </div>
          )}

          {isManager && meeting.status === "in_progress" && (
            <Button
              size="sm"
              onClick={() => void handleEndMeeting()}
              className="h-8 font-semibold bg-warning hover:bg-warning/90 text-warning-foreground rounded-lg px-3"
              title="จบการประชุมสำหรับทุกคน"
              aria-label="จบการประชุมสำหรับทุกคน"
            >
              <span className="material-symbols-outlined text-base sm:mr-1">stop_circle</span>
              <span className="hidden sm:inline">จบการประชุมเลย</span>
            </Button>
          )}

          <Button
            size="sm"
            onClick={leaveRoom}
            className="h-8 font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-lg px-3"
            aria-label="ออกจากห้องประชุม"
          >
            <span className="material-symbols-outlined text-base sm:mr-1">logout</span>
            <span className="hidden sm:inline">ออกจากห้องประชุม</span>
          </Button>
        </div>
      </header>

      {connectionFailed && (
        <div role="alert" className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          เชื่อมต่อห้องประชุมไม่ได้ — ยกมือ โหวต แชท และคำบรรยายจะยังไม่ทำงาน
          ลองออกแล้วเข้าห้องใหม่ หรือเข้าสู่ระบบอีกครั้งถ้าเซสชันหมดอายุ
        </div>
      )}

      {/* Main Workspace — stack แนวตั้งบนมือถือ, วางข้างกันตั้งแต่ md ขึ้นไป */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 relative">

        {/* Left Side: Video Grid & Shared Presentation */}
        <div className="flex-1 flex flex-col p-2 md:p-4 space-y-4 overflow-y-auto relative min-h-0">

          {/* Main content pane: เอกสารที่แชร์ > engine ฝัง (ZegoCloud) > เวทีประชุมภายนอก */}
          {sharedFile ? (
            <div className="flex-1 min-h-72 border border-border rounded-2xl bg-card overflow-hidden flex flex-col relative">
              <div className="bg-muted px-4 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground flex items-center gap-1 min-w-0">
                  <span className="material-symbols-outlined text-base text-primary">present_to_all</span>
                  <span className="truncate">
                    {isManager ? "คุณกำลังแชร์เอกสารนี้ให้ผู้เข้าร่วมทั้งหมด" : `${meeting.organizer} กำลังแชร์เอกสาร`}
                  </span>
                </span>
                {isManager && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setSharedFileId(null);
                      broadcastRef.current?.({ type: "doc_share_stop", payload: {} });
                    }}
                  >
                    หยุดการแชร์เอกสาร
                  </Button>
                )}
              </div>
              {/* ลายน้ำทับเหมือน lightbox — จอที่แชร์ให้ทั้งห้องเห็นก็ถูกถ่ายภาพออกไปได้เช่นกัน */}
              <div className="flex-1 p-2 md:p-4 flex flex-col min-h-0 relative" onContextMenu={(e) => e.preventDefault()}>
                <DocumentContent file={sharedFile} />
                <DocumentWatermark viewerName={localParticipant.name} />
              </div>
            </div>
          ) : isEmbedConference ? (
            <ZegoCloudEmbedStage
              meeting={meeting}
              isHost={isManager}
              credential={videoCredential}
              credentialError={credentialError}
              userId={videoCredential?.userId ?? localParticipant.userId ?? currentUser.id}
              displayName={localParticipant.name}
              onLeave={leaveRoom}
            />
          ) : isExternalConference ? (
            <ExternalConferenceStage conference={conference} meetingName={meeting.name} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2 border border-dashed border-border rounded-2xl">
              <span className="material-symbols-outlined text-4xl">videocam_off</span>
              <p>ไม่สามารถระบุช่องทางวิดีโอของการประชุมนี้ได้</p>
            </div>
          )}

          {/* แถบควบคุมฟีเจอร์ห้องประชุม — ยกมือ/คำบรรยาย ใช้ได้ทุกโหมด ไม่ผูกกับ engine วิดีโอ */}
          <div className="h-16 bg-card border border-border rounded-2xl items-center justify-center gap-2 sm:gap-4 px-4 shrink-0 shadow-lg flex">
            <Button
              onClick={() => toggleMyHand(!handRaised)}
              size="icon"
              className={`rounded-xl h-10 w-10 border transition-all ${
                handRaised
                  ? "bg-warning/10 border-warning/30 text-warning hover:bg-warning/15"
                  : "bg-secondary border-border text-foreground hover:bg-secondary/80"
              }`}
              title={handRaised ? "ลดมือ" : "ยกมือ"}
              aria-label={handRaised ? "ลดมือ" : "ยกมือ"}
              aria-pressed={handRaised}
            >
              <span className="material-symbols-outlined text-xl">{handRaised ? "pan_tool" : "pan_tool_alt"}</span>
            </Button>

            <Button
              onClick={() => void handleToggleSubtitle()}
              size="icon"
              className={`rounded-xl h-10 w-10 border transition-all ${
                subtitleOn
                  ? "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20"
                  : "bg-secondary border-border text-foreground hover:bg-secondary/80"
              }`}
              title="คำบรรยายสด"
              aria-label={subtitleOn ? "ปิดคำบรรยายสด" : "เปิดคำบรรยายสด"}
              aria-pressed={subtitleOn}
            >
              <span className="material-symbols-outlined text-xl">closed_caption</span>
            </Button>
          </div>

          <SubtitleBar latest={latestSubtitle} />
        </div>

        {/* Right Side: Tab Drawers for Agenda, Files, Chat, and Participants */}
        <div className="w-full md:w-80 lg:w-96 h-[45%] md:h-auto bg-card border-t md:border-t-0 md:border-l border-border flex flex-col shrink-0 min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-3 pt-3 border-b border-border bg-muted flex shrink-0">
              <TabsList className="bg-muted border border-border p-0.5 rounded-lg flex-1 h-9 w-full">
                <TabsTrigger value="agenda" className="text-xs data-[state=active]:bg-secondary rounded-md py-1.5 flex-1">วาระ</TabsTrigger>
                <TabsTrigger value="files" className="text-xs data-[state=active]:bg-secondary rounded-md py-1.5 flex-1">เอกสาร</TabsTrigger>
                <TabsTrigger value="chat" className="text-xs data-[state=active]:bg-secondary rounded-md py-1.5 flex-1">แชท</TabsTrigger>
                <TabsTrigger value="people" className="text-xs data-[state=active]:bg-secondary rounded-md py-1.5 flex-1">ผู้ร่วม</TabsTrigger>
                <TabsTrigger value="vote" className="text-xs data-[state=active]:bg-secondary rounded-md py-1.5 flex-1">โหวต</TabsTrigger>
              </TabsList>
            </div>

            {/* AGENDA */}
            <TabsContent value="agenda" className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 mt-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">ระเบียบวาระการประชุม</h3>
                {isManager && (
                  <Badge className="bg-muted border border-border text-info text-micro py-0 px-2">สิทธิ์โฮสต์</Badge>
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
                          isActive ? "bg-primary/10 border-primary/50 shadow-md shadow-primary/10" : "bg-muted border-border"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              <Badge className={`text-micro py-0 ${isActive ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"}`}>
                                วาระ {ag.no}
                              </Badge>
                              {isActive && (
                                <span className="text-micro text-primary font-bold animate-pulse flex items-center gap-0.5">
                                  <span className="material-symbols-outlined text-tiny">volume_up</span> กำลังพูดคุย
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-bold text-foreground leading-tight">{ag.title}</p>
                            {ag.detail && <p className="text-tiny text-muted-foreground mt-1 line-clamp-2">{ag.detail}</p>}
                          </div>

                          {isManager && (
                            <Button
                              onClick={() => void handleSetAgenda(isActive ? null : ag.id)}
                              size="xs"
                              variant="outline"
                              className={`text-micro font-semibold shrink-0 ${
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

            {/* DOCUMENTS */}
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
                        onClick={() => setViewingFile(file)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setViewingFile(file);
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
                            <p className="text-tiny text-muted-foreground truncate mt-0.5">{file.description || "ไม่มีคำอธิบาย"}</p>
                            <p className="text-micro text-muted-foreground mt-1">{file.size} · อัปโหลดโดย: {file.uploadedBy}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap justify-end gap-1.5 mt-2.5 pt-2 border-t border-border">
                          {isManager && (
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShareFile(file);
                              }}
                              size="xs"
                              variant="ghost"
                              className={`text-tiny ${isShared ? "text-destructive hover:bg-card" : "text-info hover:bg-card"}`}
                            >
                              <span className="material-symbols-outlined text-sm mr-1">present_to_all</span>
                              {isShared ? "หยุดแชร์" : "แชร์ให้ทุกคน"}
                            </Button>
                          )}
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingFile(file);
                            }}
                            size="xs"
                            variant="ghost"
                            className="text-foreground hover:bg-card text-tiny"
                          >
                            <span className="material-symbols-outlined text-sm mr-1">menu_book</span>
                            อ่านในเว็บ
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* CHAT */}
            <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 mt-0 bg-muted/40">
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {(meeting.chatMessages ?? []).length === 0 ? (
                  <div className="text-center py-10 text-xs text-muted-foreground">
                    ยังไม่มีข้อความ — ข้อความที่ส่งที่นี่ทุกคนในห้องเห็นและถูกเก็บไว้กับการประชุม
                  </div>
                ) : (
                  meeting.chatMessages!.map((msg) => {
                    const isMe = msg.senderId ? msg.senderId === currentUser.id : msg.sender === localParticipant.name;
                    return (
                      <div key={msg.id} className="space-y-1">
                        <span className={`text-tiny font-semibold block ${isMe ? "text-info text-right pr-1" : "text-primary"}`}>
                          {msg.sender}
                        </span>
                        <div
                          className={`p-2.5 rounded-2xl border text-xs max-w-[85%] break-words ${
                            isMe
                              ? "bg-secondary border-border text-foreground ml-auto rounded-tr-none"
                              : "bg-card border-border text-foreground rounded-tl-none"
                          }`}
                        >
                          {msg.text}
                        </div>
                        <span className={`text-micro text-muted-foreground block ${isMe ? "text-right pr-1" : "pl-1"}`}>{msg.time}</span>
                      </div>
                    );
                  })
                )}
              </div>

              <form onSubmit={handleSendChat} className="p-3 border-t border-border bg-card flex gap-2 shrink-0">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="พิมพ์ข้อความที่นี่…"
                  maxLength={1000}
                  aria-label="ข้อความแชท"
                  className="bg-muted border-border text-xs text-foreground"
                />
                <Button type="submit" className="shrink-0">ส่ง</Button>
              </form>
            </TabsContent>

            {/* PEOPLE */}
            <TabsContent value="people" className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 mt-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">รายชื่อผู้เข้าร่วมประชุม</h3>
                <Badge className="bg-card border border-border text-muted-foreground text-micro py-0 px-2">
                  ออนไลน์ {onlineCount} คน
                </Badge>
              </div>

              <HandRaiseList raised={raisedHands} isHost={isManager} onLower={lowerOther} />

              <div className="space-y-2">
                <div className="rounded-xl border border-border bg-muted p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {localParticipant.name.split(" ")[1]?.charAt(0) || localParticipant.name.charAt(0) || "U"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate text-foreground">{localParticipant.name} (คุณ)</p>
                      <p className="text-micro text-muted-foreground truncate">{localParticipant.position}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {handRaised && <span className="material-symbols-outlined text-warning text-sm animate-bounce">pan_tool</span>}
                    <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
                    <span className="text-micro text-muted-foreground">ออนไลน์</span>
                  </div>
                </div>

                {meeting.participants
                  .filter((p) => p.id !== localParticipant.id)
                  .map((p) => {
                    const online = isOnline(p.userId);
                    const raised = p.userId ? raisedHands.some((h) => h.userId === p.userId) : false;
                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border p-2.5 flex items-center justify-between transition-opacity ${
                          online ? "border-border bg-muted" : "border-border opacity-40 bg-muted/20"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 ${
                            online ? "bg-secondary border-border text-foreground" : "bg-card border-border text-muted-foreground"
                          }`}>
                            {p.name.split(" ")[1]?.charAt(0) || p.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate text-foreground">{p.name}</p>
                            <p className="text-micro text-muted-foreground truncate">{p.position} {!p.inSystem && "· ภายนอก"}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {raised && <span className="material-symbols-outlined text-warning text-sm animate-bounce">pan_tool</span>}
                          <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-success" : "bg-muted-foreground/40"}`}></span>
                          <span className="text-micro text-muted-foreground">{online ? "ออนไลน์" : "ออฟไลน์"}</span>
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

      {viewingFile && (
        <DocumentLightbox
          file={viewingFile}
          onClose={() => setViewingFile(null)}
          viewerName={currentUser.name}
          confidentialityLevel={meeting.confidentialityLevel ?? "normal"}
        />
      )}
    </div>
    </RoomSignalingProvider>
  );
}
