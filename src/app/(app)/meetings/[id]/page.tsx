"use client";

import { useState, useRef, use, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { meetingStatusLabels, meetingStatusColors, displayFormats, MeetingStatus, Meeting, canViewFile, fileVisibilityLabels, fileVisibilityColors, fileVisibilityIcons, users, fileTypeLabels, MeetingFile, FileVisibility } from "@/data";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { today } from "@/lib/clock";
import { ComingSoon, ComingSoonBadge } from "@/components/ui/ComingSoon";
import { DocumentLightbox } from "@/components/meeting/DocumentPreview";
import { TranscriptTimeline } from "@/components/meeting/TranscriptTimeline";
import { ZoomRoomStatus } from "@/components/meeting/ZoomRoomStatus";
import { putFile, formatBytes } from "@/services/fileStorage";
import { can, canEditMeeting, denialReason } from "@/lib/authz";
import { useCurrentUser } from "@/context/UserContext";
import { useMeetings } from "@/context/MeetingContext";
import { createInviteToken, getTokensForMeeting, revokeToken, buildJoinUrl, type InviteToken } from "@/lib/inviteTokens";
import { downloadIcs } from "@/lib/calendar";
import { generateMockTranscript } from "@/services/transcription/mockProvider";
import { mockSummarizer } from "@/services/summarize/mockSummarizer";
import { buildReportMarkdown } from "@/services/summarize/reportBuilder";

const iconSm = "material-symbols-outlined text-[16px]";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

const statusOrder: MeetingStatus[] = ["prepare", "notified", "in_progress", "waiting_endorse", "endorsed"];

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { meetings } = useMeetings();
  const meeting = meetings.find(m => m.id === id);

  // เดิมเป็น `|| meetings[0]` ซึ่งทำให้ URL ผิดแสดงประชุมแรกเงียบๆ
  // อันตรายเพราะผู้ใช้เข้าใจว่ากำลังดู/แก้ประชุมที่ต้องการ ทั้งที่เป็นคนละรายการ
  if (!meeting) {
    return (
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <span className="material-symbols-outlined text-[48px] text-muted-foreground mb-2">search_off</span>
          <h1 className="text-base font-semibold">ไม่พบการประชุมนี้</h1>
          <p className="text-xs text-muted-foreground mt-1">
            รหัสการประชุม &quot;{id}&quot; ไม่มีอยู่ในระบบ หรือถูกลบไปแล้ว
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/meetings">กลับสู่รายการการประชุม</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <MeetingDetail meeting={meeting} />;
}

function MeetingDetail({ meeting }: { meeting: Meeting }) {
  const { currentUser } = useCurrentUser();
  const { updateMeeting, addMeetingFile, addMeetingComment } = useMeetings();
  const visibleFiles = meeting.files.filter(f => canViewFile(f, currentUser, meeting));
  const hiddenFileCount = meeting.files.length - visibleFiles.length;
  const shouldForce = meeting.participants.length === 0 && meeting.status !== "endorsed";
  const [tab, setTab] = useState(shouldForce ? "participants" : "agenda");
  const [notifyDialog, setNotifyDialog] = useState(false);
  const [endorseDialog, setEndorseDialog] = useState(false);
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const [participantName, setParticipantName] = useState("");
  const [participantPos, setParticipantPos] = useState("กรรมการ");
  const [participantSearch, setParticipantSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedUsersPos, setSelectedUsersPos] = useState<Record<string, string>>({});
  const [addFileOpen, setAddFileOpen] = useState(false);
  const [secretGroupOpen, setSecretGroupOpen] = useState(false);
  const [displayFormatOpen, setDisplayFormatOpen] = useState(false);
  const [emailSenderOpen, setEmailSenderOpen] = useState(false);
  const [emailSender, setEmailSender] = useState(meeting.emailSenderName);
  const [editInfoOpen, setEditInfoOpen] = useState(false);
  const [editName, setEditName] = useState(meeting.name);
  const [editShortName, setEditShortName] = useState(meeting.shortName);
  const [editType, setEditType] = useState(meeting.type);
  const [textBoxesOpen, setTextBoxesOpen] = useState(false);
  const [textBoxes, setTextBoxes] = useState<{ id: string; name: string }[]>(meeting.extraTextBoxes || []);
  const [newBoxName, setNewBoxName] = useState("");
  const [openTimeDialog, setOpenTimeDialog] = useState(false);
  const [endorseNotifyOpen, setEndorseNotifyOpen] = useState(false);
  const [addPermOpen, setAddPermOpen] = useState(false);
  const [permType, setPermType] = useState<"manager" | "reader">("reader");
  const [permName, setPermName] = useState("");
  const [addAgendaOpen, setAddAgendaOpen] = useState(false);
  const [agendaNo, setAgendaNo] = useState("");
  const [agendaTitle, setAgendaTitle] = useState("");
  const [agendaDetail, setAgendaDetail] = useState("");
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [forceParticipants, setForceParticipants] = useState(shouldForce);
  const [fileDesc, setFileDesc] = useState("");
  // ข้อมูลไฟล์สำหรับเดโม — ยังไม่เก็บตัวไฟล์จริง เก็บแค่ระเบียนเอกสาร
  const [fileName, setFileName] = useState("");
  const [fileSizeKb, setFileSizeKb] = useState<number | null>(null);
  const [fileType, setFileType] = useState<MeetingFile["type"]>("attachment");
  const [fileVisibility, setFileVisibility] = useState<FileVisibility>("participants");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const filePickerRef = useRef<HTMLInputElement>(null);
  // เปิดอ่านเอกสารในเว็บ — ระบบไม่มีการดาวน์โหลดไฟล์ออก
  const [previewFile, setPreviewFile] = useState<MeetingFile | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewZoom, setPreviewZoom] = useState(100);
  const openFilePreview = (f: MeetingFile) => {
    setPreviewFile(f); setPreviewPage(1); setPreviewZoom(100);
  };

  // ─── Magic Link guest invite ───
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteTokens, setInviteTokens] = useState<InviteToken[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [showEmailPreview, setShowEmailPreview] = useState<InviteToken | null>(null);

  useEffect(() => {
    setInviteTokens(getTokensForMeeting(meeting.id));
  }, [meeting.id]);

  const handleSendInvite = () => {
    if (!inviteEmail.trim()) {
      toast.error("กรุณาระบุ email ของผู้ได้รับเชิญ");
      return;
    }
    const token = createInviteToken(meeting.id, inviteEmail.trim(), currentUser.name, inviteName.trim() || undefined);
    setInviteTokens(getTokensForMeeting(meeting.id));
    setInviteEmail("");
    setInviteName("");
    setShowEmailPreview(token);
    toast.success("สร้าง Magic Link สำเร็จ", { description: `ส่งให้ ${inviteEmail.trim()}` });
  };

  const handleCopyLink = (token: string) => {
    const url = buildJoinUrl(token);
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success("คัดลอกลิงก์แล้ว");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleRevokeToken = (tokenId: string) => {
    revokeToken(tokenId);
    setInviteTokens(getTokensForMeeting(meeting.id));
    toast.success("ยกเลิกลิงก์เชิญแล้ว");
  };

  // ─── Phase C-4: Transcript + Summary pipeline ───
  const [transcriptBusy, setTranscriptBusy] = useState(false);
  const [summaryBusy, setSummaryBusy]       = useState(false);

  const requestTranscript = async () => {
    setTranscriptBusy(true);
    updateMeeting(meeting.id, { transcriptStatus: "processing" });
    await new Promise(r => setTimeout(r, 2000));
    updateMeeting(meeting.id, { transcriptStatus: "ready" });
    setTranscriptBusy(false);
    toast.success("ได้รับ Transcript แล้ว", { description: "สามารถสร้างร่างรายงานสรุปได้" });
  };

  const generateSummary = async () => {
    setSummaryBusy(true);
    try {
      const transcript = generateMockTranscript(meeting);
      const summary    = await mockSummarizer.summarizeByAgenda(transcript, []);
      const mdContent  = buildReportMarkdown(meeting, summary);
      const mdBlob     = new Blob([mdContent], { type: "text/markdown; charset=utf-8" });
      const mdFile     = new File([mdBlob], "report_draft_summary.md", { type: "text/markdown" });
      const stored     = await putFile(mdFile);

      const draftFileId = `RF-${Date.now()}`;
      const now         = new Date();
      const uploadedAt  = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

      addMeetingFile(meeting.id, {
        id:          draftFileId,
        name:        `ร่างรายงาน_${meeting.shortName || meeting.name}.md`,
        description: "ร่างรายงานสรุปการประชุมโดย AI — ต้องผ่านการรับรองก่อนถือเป็นทางการ",
        size:        formatBytes(stored.sizeBytes),
        uploadedAt,
        uploadedBy:  currentUser.name,
        type:        "report_draft",
        visibility:  "participants",
        storageKey:  stored.storageKey,
        mimeType:    stored.mimeType,
        sizeBytes:   stored.sizeBytes,
      });
      updateMeeting(meeting.id, { summaryDraftId: draftFileId });
      toast.success("สร้างร่างรายงานสรุปแล้ว", { description: "ดูได้ที่รายการเอกสารด้านบน" });
    } catch {
      toast.error("สร้างรายงานไม่สำเร็จ");
    } finally {
      setSummaryBusy(false);
    }
  };

  const changeStatus = (s: MeetingStatus) => {
    updateMeeting(meeting.id, { status: s });
    toast.success(`เปลี่ยนสถานะเป็น: ${meetingStatusLabels[s]}`);
  };

  const [notifyPreviewStep, setNotifyPreviewStep] = useState<"config" | "preview">("config");

  const systemParticipants = meeting.participants.filter(p => p.inSystem);
  const externalParticipants = meeting.participants.filter(p => !p.inSystem);

  const notifyAgenda = () => {
    const sysCount = systemParticipants.length;
    const extCount = externalParticipants.length;
    const extList = [...externalParticipants];

    setNotifyDialog(false);
    setNotifyPreviewStep("config");

    const now = new Date().toISOString();
    updateMeeting(meeting.id, { status: "notified", notifiedAt: now });

    for (const ext of extList) {
      if (ext.email && ext.email !== "-") {
        createInviteToken(meeting.id, ext.email, currentUser.name, ext.name);
      }
    }

    toast.success("ส่ง Email แจ้งวาระเรียบร้อย", {
      description: `แจ้งคนในระบบ ${sysCount} ราย, บุคคลภายนอก ${extCount} ราย`,
    });
  };

  const sendReminder = () => {
    const now = new Date().toISOString();
    updateMeeting(meeting.id, { reminderSentAt: now });
    toast.success("ส่ง Reminder พร้อมลิงก์ประชุมแล้ว", {
      description: `แจ้งเตือนไปยัง ${meeting.participants.length} ราย`,
    });
  };

  const confirmOpenMeeting = (useCurrentTime: boolean) => {
    const now = new Date();
    const nowStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    updateMeeting(meeting.id, {
      status: "in_progress",
      startTime: useCurrentTime ? nowStr : meeting.startTime,
    });
    setOpenTimeDialog(false);
    toast.success(useCurrentTime ? `เปิดการประชุมแล้ว (เวลาเริ่ม ${nowStr} น.)` : "เปิดการประชุมแล้ว (ตามเวลาที่กำหนดไว้)");
  };

  const closeMeeting = () => {
    updateMeeting(meeting.id, { status: "waiting_endorse" });
    toast.success("ปิดการประชุมแล้ว รอการรับรอง");
  };

  const sendEndorseEmail = () => {
    setEndorseNotifyOpen(false);
    toast.success("ส่ง Email แจ้งรับรองการประชุมเรียบร้อย", { description: `แจ้งไปยัง ${meeting.participants.length} ราย` });
  };

  const addPermission = () => {
    if (!permName.trim()) { toast.error("กรุณาพิมพ์ชื่อผู้ใช้งาน"); return; }
    // ต้องผูกกับบัญชีจริง — เดิมสร้าง id ปลอม (U-<timestamp>) ทำให้สิทธิ์ที่เพิ่มไม่มีผลกับใครเลย
    const target = users.find((u) => u.name === permName.trim());
    if (!target) {
      toast.error("ไม่พบผู้ใช้งานนี้ในระบบ", { description: "กรุณาเลือกชื่อจากรายการที่ระบบแนะนำ" });
      return;
    }
    if (meeting.permissions.some((p) => p.userId === target.id)) {
      toast.error("ผู้ใช้งานนี้มีสิทธิ์อยู่แล้ว");
      return;
    }
    updateMeeting(meeting.id, {
      permissions: [...meeting.permissions, { userId: target.id, name: target.name, type: permType }]
    });
    toast.success(`เพิ่มสิทธิ์${permType === "manager" ? "ผู้จัดการประชุม" : "ผู้อ่าน"}สำเร็จ`);
    setPermName(""); setPermType("reader");
    setAddPermOpen(false);
  };

  const closeFileDialog = () => {
    setAddFileOpen(false);
    setFileName(""); setFileSizeKb(null); setFileDesc("");
    setFileType("attachment"); setFileVisibility("participants");
    setPendingFile(null); setUploading(false);
  };

  const submitFile = async () => {
    const name = fileName.trim();
    if (!name) { toast.error("กรุณาระบุชื่อเอกสาร"); return; }

    setUploading(true);
    try {
      // ถ้ามี File จริง → เก็บลง IndexedDB · ถ้าไม่มี (พิมพ์ชื่อเอง) → เก็บเฉพาะระเบียน
      let storageMeta: { storageKey?: string; mimeType?: string; sizeBytes?: number } = {};
      if (pendingFile) {
        const stored = await putFile(pendingFile);
        storageMeta = { storageKey: stored.storageKey, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes };
      }

      const displaySize = pendingFile
        ? formatBytes(pendingFile.size)
        : (() => {
            const kb = fileSizeKb ?? Math.floor(120 + Math.random() * 1800);
            return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
          })();

      addMeetingFile(meeting.id, {
        id: `F-${Date.now()}`,
        name: /\.(pdf|docx|xlsx|png|jpg|jpeg)$/i.test(name) ? name : `${name}.pdf`,
        description: fileDesc.trim() || "เอกสารประกอบการประชุม",
        size: displaySize,
        uploadedAt: today,
        uploadedBy: currentUser.name,
        type: fileType,
        visibility: fileVisibility,
        ...storageMeta,
      });
      toast.success("เพิ่มเอกสารเรียบร้อย", {
        description: `${name} · ${fileVisibilityLabels[fileVisibility]}${pendingFile ? " · ไฟล์บันทึกแล้ว" : ""}`,
      });
      closeFileDialog();
    } catch (e) {
      console.error(e);
      toast.error("บันทึกไฟล์ไม่สำเร็จ", { description: "IndexedDB ปฏิเสธการเขียน" });
      setUploading(false);
    }
  };

  const removePermission = (index: number) => {
    const target = meeting.permissions[index];
    updateMeeting(meeting.id, {
      permissions: meeting.permissions.filter((_, i) => i !== index)
    });
    toast.success(`ลบสิทธิ์ของ ${target.name} แล้ว`);
  };

  const addAgenda = () => {
    if (!agendaTitle.trim()) { toast.error("กรุณากรอกชื่อวาระ"); return; }
    updateMeeting(meeting.id, {
      agenda: [...meeting.agenda, {
        id: `AG-${Date.now()}`,
        no: agendaNo.trim() || String(meeting.agenda.filter(a => !a.no.includes(".")).length + 1),
        title: agendaTitle.trim(),
        detail: agendaDetail.trim() || undefined,
        comments: [],
      }]
    });
    toast.success("เพิ่มวาระสำเร็จ");
    setAgendaNo(""); setAgendaTitle(""); setAgendaDetail("");
    setAddAgendaOpen(false);
  };

  const submitComment = (agendaId: string) => {
    if (!commentText.trim()) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    addMeetingComment(meeting.id, agendaId, { by: currentUser.name, text: commentText.trim(), time });
    setCommentText(""); setCommentFor(null);
  };

  const saveInfo = () => {
    if (!editName.trim()) { toast.error("กรุณากรอกชื่อการประชุม"); return; }
    updateMeeting(meeting.id, { name: editName.trim(), shortName: editShortName.trim(), type: editType });
    setEditInfoOpen(false);
    toast.success("บันทึกข้อมูลการประชุมเรียบร้อย");
  };

  const openEditInfo = () => {
    setEditName(meeting.name);
    setEditShortName(meeting.shortName);
    setEditType(meeting.type);
    setEditInfoOpen(true);
  };

  const endorseMeeting = () => {
    updateMeeting(meeting.id, { status: "endorsed" });
    setEndorseDialog(false);
    toast.success("รับรองการประชุมแล้ว — ไม่สามารถแก้ไขได้อีก");
  };

  const setAttendance = (pid: string, v: "attend" | "representative" | "absent") => {
    updateMeeting(meeting.id, {
      participants: meeting.participants.map(p => p.id === pid ? { ...p, attendance: v } : p)
    });
  };

  const togglePresent = (pid: string) => {
    updateMeeting(meeting.id, {
      participants: meeting.participants.map(p => p.id === pid ? { ...p, present: !p.present } : p)
    });
  };

  const addExternalParticipant = () => {
    if (!participantName.trim()) { toast.error("กรุณากรอกชื่อ"); return; }
    updateMeeting(meeting.id, {
      participants: [...meeting.participants, {
        id: `P-${Date.now()}`,
        userId: null,
        name: participantName,
        position: participantPos,
        role: "ผู้ทรงคุณวุฒิภายนอก",
        department: "ภายนอก",
        email: "-",
        attendance: "pending",
        inSystem: false,
      }]
    });
    toast.success("เพิ่มองค์ประชุมสำเร็จ");
    setParticipantName(""); setParticipantPos("กรรมการ");
    setAddParticipantOpen(false);
  };

  const addSelectedSystemUsers = () => {
    if (selectedUserIds.length === 0) { toast.error("กรุณาเลือกผู้ใช้อย่างน้อย 1 คน"); return; }
    const newParticipants = selectedUserIds.map((uid, i) => {
      const u = users.find(x => x.id === uid)!;
      return {
        id: `P-${Date.now()}-${i}`,
        userId: u.id,
        name: u.name,
        position: selectedUsersPos[uid] || "กรรมการ",
        role: u.position,
        department: u.department,
        email: u.email,
        attendance: "pending" as const,
        inSystem: true,
      };
    });
    updateMeeting(meeting.id, {
      participants: [...meeting.participants, ...newParticipants]
    });
    toast.success(`เพิ่มองค์ประชุม ${newParticipants.length} คนสำเร็จ`);
    setSelectedUserIds([]); setSelectedUsersPos({}); setParticipantSearch("");
    setAddParticipantOpen(false);
  };

  const existingUserIds = new Set(meeting.participants.filter(p => p.userId).map(p => p.userId));
  const availableUsers = users.filter(u => !existingUserIds.has(u.id) && u.systemRole !== "external");
  const filteredUsers = participantSearch.trim()
    ? availableUsers.filter(u =>
        u.name.includes(participantSearch) ||
        u.department.includes(participantSearch) ||
        u.position.includes(participantSearch) ||
        u.email.toLowerCase().includes(participantSearch.toLowerCase())
      )
    : availableUsers;

  const toggleUserSelection = (uid: string) => {
    setSelectedUserIds(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  // สิทธิ์แยกตามการกระทำ — เดิมใช้ตัวเดียวเช็คแค่สถานะ ทำให้ใครที่เป็น manager
  // ก็รับรองประชุมของคนอื่น ส่งอีเมลหาองค์ประชุมทุกคน หรือเพิ่มตัวเองเป็นผู้จัดการได้
  const canEdit = canEditMeeting(currentUser, meeting);
  const canManageParticipants = can(currentUser, "meeting.manageParticipants", meeting) && meeting.status !== "endorsed";
  const canManagePermissions = can(currentUser, "meeting.managePermissions", meeting) && meeting.status !== "endorsed";
  const canNotify = can(currentUser, "meeting.notify", meeting);
  const canChangeStatus = can(currentUser, "meeting.changeStatus", meeting) && meeting.status !== "endorsed";
  const canEndorse = can(currentUser, "meeting.endorse", meeting);
  const noPermissionReason = denialReason(currentUser, "meeting.edit", meeting);

  return (
    <div className="p-4 md:p-6 pb-16 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-4">
        <Link href="/meetings" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
          <span className={iconSm}>arrow_back</span> กลับสู่รายการการประชุม
        </Link>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge className={`${meetingStatusColors[meeting.status]} text-[11px] border`}>{meetingStatusLabels[meeting.status]}</Badge>
              <span className="text-xs text-muted-foreground">{meeting.committee}</span>
            </div>
            <h1 className="text-lg md:text-2xl font-semibold leading-tight">{meeting.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className={iconSm}>calendar_today</span>{fmtDate(meeting.date)}</span>
              <span className="flex items-center gap-1"><span className={iconSm}>schedule</span>{meeting.startTime} - {meeting.endTime}</span>
              <span className="flex items-center gap-1"><span className={iconSm}>place</span>{meeting.location}</span>
              <span className="flex items-center gap-1"><span className={iconSm}>person</span>ผู้จัด: {meeting.organizer}</span>
              {meeting.conferenceLink && (
                <a href={meeting.conferenceLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                  <span className={iconSm}>videocam</span> เข้าห้องประชุมทางไกล
                </a>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(meeting.status === "in_progress" || meeting.status === "notified" || meeting.status === "waiting_endorse") && (
              <Button asChild size="sm" className="bg-rose-600 hover:bg-rose-700 text-white font-medium border-none shadow-md animate-pulse">
                <Link href={`/live/${meeting.id}`}>
                  <span className="material-symbols-outlined text-[16px] mr-1.5">video_call</span>
                  เข้าห้องประชุมออนไลน์ (Live)
                </Link>
              </Button>
            )}
            {meeting.status === "prepare" && canNotify && (
              <Button size="sm" onClick={() => setNotifyDialog(true)}><span className={iconSm}>send</span>แจ้งวาระ</Button>
            )}
            {meeting.status === "notified" && canNotify && !meeting.reminderSentAt && (
              <Button size="sm" variant="outline" onClick={sendReminder}>
                <span className={iconSm}>notifications_active</span>ส่ง Reminder + ลิงก์ประชุม
              </Button>
            )}
            {meeting.status === "notified" && meeting.reminderSentAt && (
              <Badge variant="secondary" className="text-[10px] h-8 px-3">
                <span className="material-symbols-outlined text-[14px] mr-1 text-green-600">check_circle</span>
                ส่ง Reminder แล้ว
              </Badge>
            )}
            {meeting.status === "notified" && canChangeStatus && (
              <Button size="sm" onClick={() => setOpenTimeDialog(true)}><span className={iconSm}>play_circle</span>เปิดประชุม</Button>
            )}
            {meeting.status === "in_progress" && canChangeStatus && (
              <Button
                size="sm"
                onClick={() => {
                  closeMeeting();
                  toast.info("ประชุมจบแล้ว — สามารถขอ Transcript ได้", { description: "ไปที่แท็บ 'สรุปประชุม' เพื่อสร้างรายงาน" });
                }}
              >
                <span className={iconSm}>stop_circle</span>ปิดประชุม
              </Button>
            )}
            {meeting.status === "waiting_endorse" && canEndorse && (
              <>
                <Button size="sm" variant="outline" onClick={() => setEndorseNotifyOpen(true)}><span className={iconSm}>mail</span>แจ้งรับรอง</Button>
                <Button size="sm" onClick={() => setEndorseDialog(true)}><span className={iconSm}>verified</span>รับรองการประชุม</Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">การจัดการ <span className={iconSm}>expand_more</span></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>เมนูการจัดการ</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!canEdit} onClick={openEditInfo}>
                  <span className={iconSm}>edit</span> จัดการข้อมูลการประชุม
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canEdit} onClick={() => setTextBoxesOpen(true)}>
                  <span className={iconSm}>add_box</span> จัดการกล่องข้อความเพิ่มเติม
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canEdit} onClick={() => setDisplayFormatOpen(true)}>
                  <span className={iconSm}>format_list_bulleted</span> จัดการรูปแบบการแสดงชื่อ
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canEdit} onClick={() => setEmailSenderOpen(true)}>
                  <span className={iconSm}>outgoing_mail</span> ตั้งค่าชื่อผู้ส่งอีเมล
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canEdit} onClick={() => setSecretGroupOpen(true)}>
                  <span className={iconSm}>lock</span> จัดการกลุ่มชั้นความลับ
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>เปลี่ยนสถานะ (คืนสถานะ)</DropdownMenuLabel>
                {statusOrder.map(s => (
                  <DropdownMenuItem key={s} disabled={s === meeting.status || !canChangeStatus} onClick={() => changeStatus(s)}>
                    {meetingStatusLabels[s]}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* บอกเหตุผลเมื่อดูได้แต่แก้ไม่ได้ — ไม่งั้นผู้ใช้เห็นหน้าที่ปุ่มหายไปเฉยๆ โดยไม่รู้ว่าทำไม */}
      {!canEdit && (
        <Card className="card-shadow mb-4 border-amber-300 bg-amber-50">
          <CardContent className="p-3 flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] text-amber-700 shrink-0">visibility</span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-amber-900">กำลังดูในโหมดอ่านอย่างเดียว</p>
              <p className="text-[11px] text-amber-800 mt-0.5">{noPermissionReason}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status stepper */}
      <Card className="card-shadow mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2 overflow-x-auto">
            {statusOrder.map((s, i) => {
              const currentIdx = statusOrder.indexOf(meeting.status);
              const done = i < currentIdx;
              const active = i === currentIdx;
              return (
                <div key={s} className="flex items-center gap-2 flex-shrink-0">
                  <div className={`flex flex-col items-center gap-1 min-w-[120px] ${active ? "" : done ? "opacity-80" : "opacity-40"}`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      done ? "bg-primary text-white" : active ? "bg-primary text-white ring-4 ring-primary/20" : "bg-muted text-muted-foreground"
                    }`}>
                      {done ? <span className={iconSm}>check</span> : i + 1}
                    </div>
                    <span className={`text-[11px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
                      {meetingStatusLabels[s].replace(/^\d+\.\s*/, "")}
                    </span>
                  </div>
                  {i < statusOrder.length - 1 && (
                    <div className={`h-[2px] w-8 md:w-12 ${done ? "bg-primary" : "bg-muted"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="agenda"><span className={iconSm}>list_alt</span> วาระการประชุม</TabsTrigger>
          <TabsTrigger value="participants"><span className={iconSm}>groups</span> องค์ประชุม</TabsTrigger>
          <TabsTrigger value="files"><span className={iconSm}>folder</span> ไฟล์เอกสาร</TabsTrigger>
          <TabsTrigger value="permissions"><span className={iconSm}>admin_panel_settings</span> สิทธิ์</TabsTrigger>
          <TabsTrigger value="info"><span className={iconSm}>info</span> ข้อมูลการประชุม</TabsTrigger>
        </TabsList>

        {/* AGENDA */}
        <TabsContent value="agenda" className="mt-4 space-y-3">
          <Card className="card-shadow">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">วาระการประชุม</CardTitle>
                <CardDescription className="text-xs">แสดงความคิดเห็นในวาระย่อยได้ระหว่างดำเนินการประชุม</CardDescription>
              </div>
              {canEdit && <Button size="sm" variant="outline" onClick={() => setAddAgendaOpen(true)}><span className={iconSm}>add</span>เพิ่มวาระ</Button>}
            </CardHeader>
            <CardContent className="space-y-2">
              {meeting.agenda.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">ยังไม่มีวาระการประชุม</p>
              ) : meeting.agenda.map(a => (
                <div key={a.id} className="rounded-lg border p-3" style={{ paddingLeft: a.no.includes(".") ? 24 : 12 }}>
                  <div className="flex items-start gap-2">
                    <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${a.no.includes(".") ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>{a.no}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{a.title}</p>
                        {a.secretGroupId && <Badge variant="secondary" className="text-[10px]"><span className={iconSm}>lock</span>วาระลับ</Badge>}
                      </div>
                      {a.detail && <p className="text-xs text-muted-foreground mt-1">{a.detail}</p>}
                      {a.comments.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {a.comments.map((c, i) => (
                            <div key={i} className="text-xs bg-muted/50 rounded p-2">
                              <span className="font-semibold">{c.by}</span>
                              <span className="text-muted-foreground"> · {c.time}</span>
                              <p className="text-muted-foreground mt-0.5">{c.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {meeting.status === "in_progress" && (
                        commentFor === a.id ? (
                          <div className="mt-2 flex gap-2">
                            <Input
                              value={commentText}
                              onChange={e => setCommentText(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") submitComment(a.id); }}
                              placeholder="พิมพ์ความคิดเห็นในวาระนี้..."
                              className="h-8 text-xs"
                              autoFocus
                            />
                            <Button size="sm" className="h-8 shrink-0" onClick={() => submitComment(a.id)}>ส่ง</Button>
                            <Button size="sm" variant="ghost" className="h-8 shrink-0" onClick={() => { setCommentFor(null); setCommentText(""); }}>ยกเลิก</Button>
                          </div>
                        ) : (
                          <Button size="xs" variant="ghost" className="mt-2 text-xs h-6" onClick={() => setCommentFor(a.id)}>
                            <span className={iconSm}>chat</span>แสดงความคิดเห็น
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PARTICIPANTS */}
        <TabsContent value="participants" className="mt-4 space-y-3">
          <Card className="card-shadow">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">องค์ประชุมชุดปัจจุบัน ({meeting.participants.length})</CardTitle>
                <CardDescription className="text-xs">จัดการรายชื่อองค์ประชุม การตอบรับ และการเข้าร่วมจริง</CardDescription>
              </div>
              {canManageParticipants && (
                <Button size="sm" onClick={() => setAddParticipantOpen(true)}>
                  <span className={iconSm}>person_add</span> เพิ่มองค์ประชุม
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 px-2">ชื่อ - สกุล</th>
                      <th className="text-left py-2 px-2">ตำแหน่งในที่ประชุม</th>
                      <th className="text-left py-2 px-2">หน่วยงาน</th>
                      <th className="text-left py-2 px-2">การตอบรับ</th>
                      {meeting.status === "in_progress" || meeting.status === "waiting_endorse" || meeting.status === "endorsed" ? (
                        <th className="text-center py-2 px-2">เข้าร่วมจริง</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {meeting.participants.map(p => (
                      <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/40">
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-primary text-xs font-semibold">{p.name.charAt(p.name.indexOf(" ") + 1)}</span>
                            </div>
                            <div>
                              <p className="font-medium">{p.name}</p>
                              <p className="text-[11px] text-muted-foreground">{p.role} {!p.inSystem && <span className="text-amber-600">· ภายนอก</span>}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-xs">
                          <Badge variant={p.position === "ประธาน" ? "default" : "secondary"} className="text-[10px]">{p.position}</Badge>
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground">{p.department}</td>
                        <td className="py-2 px-2 text-xs">
                          <select
                            className="border rounded px-2 py-0.5 text-xs bg-transparent"
                            value={p.attendance || "pending"}
                            onChange={e => setAttendance(p.id, e.target.value as "attend" | "representative" | "absent")}
                            disabled={!canManageParticipants}
                          >
                            <option value="pending">รอตอบรับ</option>
                            <option value="attend">เข้าร่วม</option>
                            <option value="representative">ส่งผู้แทน</option>
                            <option value="absent">ไม่เข้าร่วม</option>
                          </select>
                        </td>
                        {(meeting.status === "in_progress" || meeting.status === "waiting_endorse" || meeting.status === "endorsed") && (
                          <td className="py-2 px-2 text-center">
                            <input type="checkbox" checked={!!p.present} onChange={() => togglePresent(p.id)} disabled={!canManageParticipants} className="w-4 h-4 accent-primary" />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FILES */}
        <TabsContent value="files" className="mt-4 space-y-3">
          <Card className="card-shadow">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">ระเบียบ/คำสั่ง และเอกสารประกอบ</CardTitle>
                <CardDescription className="text-xs">ไฟล์ประกอบการประชุม, รายงานร่าง และรายงานฉบับสมบูรณ์</CardDescription>
              </div>
              {canEdit && (
                <Button size="sm" onClick={() => setAddFileOpen(true)}>
                  <span className={iconSm}>upload_file</span> อัปโหลดไฟล์
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {meeting.files.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">ยังไม่มีไฟล์แนบ</p>
              ) : (
                <div className="space-y-2">
                  {hiddenFileCount > 0 && (
                    <div className="rounded-lg border border-dashed p-3 flex items-center gap-2 bg-muted/30">
                      <span className="material-symbols-outlined text-muted-foreground text-[18px]">visibility_off</span>
                      <p className="text-xs text-muted-foreground">
                        มีเอกสารอีก <span className="font-semibold text-foreground">{hiddenFileCount}</span> ไฟล์ที่คุณไม่มีสิทธิ์เข้าถึงในการประชุมนี้
                      </p>
                    </div>
                  )}
                  {visibleFiles.map(f => (
                    <div key={f.id} className="rounded-lg border p-3 flex items-center gap-3 hover:border-primary/50 transition-colors">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-primary">
                          {f.name.endsWith(".pdf") ? "picture_as_pdf" : f.name.endsWith(".docx") ? "description" : f.name.endsWith(".xlsx") ? "table_chart" : "attach_file"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{f.description}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {f.uploadedBy} · {f.uploadedAt} · {f.size}
                        </p>
                      </div>
                      <div className="hidden md:flex flex-col items-end gap-1">
                        <Badge className={`text-[10px] border ${fileVisibilityColors[f.visibility]}`} variant="secondary">
                          <span className="material-symbols-outlined text-[12px] mr-0.5">{fileVisibilityIcons[f.visibility]}</span>
                          {fileVisibilityLabels[f.visibility]}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {f.type === "regulation" ? "ระเบียบ/คำสั่ง" :
                           f.type === "attachment" ? "เอกสารประกอบ" :
                           f.type === "report_draft" ? "ร่างรายงาน" :
                           "รายงานฉบับสมบูรณ์"}
                        </Badge>
                      </div>
                      <Button size="sm" variant="ghost" className="text-primary shrink-0" onClick={() => openFilePreview(f)}>
                        <span className={`${iconSm} mr-1`}>visibility</span>
                        ดูเอกสาร
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {/* ─── ถอดคำพูด (จากซับไตเติลที่บันทึกในเบราว์เซอร์นี้) ─── */}
          <Card className="card-shadow border-dashed">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">subtitles</span>
                <div>
                  <CardTitle className="text-sm">ถอดคำพูด</CardTitle>
                  <CardDescription className="text-xs">
                    บทถอดคำพูดจากซับไตเติลที่บันทึกไว้ในเบราว์เซอร์นี้ระหว่างการประชุม
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <TranscriptTimeline meetingId={meeting.id} />
            </CardContent>
          </Card>
          {/* ─── สรุปการประชุมอัตโนมัติ (แสดงเมื่อมีสิทธิ์แก้ไข) ─── */}
          {canEdit && (
            <Card className="card-shadow border-dashed">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">smart_toy</span>
                  <div>
                    <CardTitle className="text-sm">สรุปการประชุมอัตโนมัติ</CardTitle>
                    <CardDescription className="text-xs">
                      สร้างร่างรายงานสรุปจาก transcript การประชุม — ต้องผ่านการตรวจสอบและรับรองก่อนถือเป็นทางการ
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Transcript status */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-muted-foreground">mic</span>
                    <div>
                      <p className="text-xs font-medium">Transcript การประชุม</p>
                      <p className="text-[11px] text-muted-foreground">
                        {meeting.transcriptStatus === "none"   || !meeting.transcriptStatus ? "ยังไม่มี transcript" :
                         meeting.transcriptStatus === "processing" ? "กำลังประมวลผล..." :
                         meeting.transcriptStatus === "ready"      ? "พร้อมใช้งาน" :
                         "เกิดข้อผิดพลาด"}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={transcriptBusy || meeting.transcriptStatus === "ready" || meeting.transcriptStatus === "processing" || meeting.status === "in_progress"}
                    onClick={requestTranscript}
                    title={meeting.status === "in_progress" ? "ต้องปิดประชุมก่อน" : undefined}
                  >
                    {transcriptBusy
                      ? <><span className="material-symbols-outlined animate-spin text-[14px] mr-1">progress_activity</span>กำลังดึง...</>
                      : meeting.transcriptStatus === "ready"
                      ? <><span className="material-symbols-outlined text-[14px] mr-1 text-green-600">check_circle</span>ได้รับแล้ว</>
                      : "ขอ Transcript"}
                  </Button>
                </div>

                {/* Generate summary */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-muted-foreground">summarize</span>
                    <div>
                      <p className="text-xs font-medium">ร่างรายงานสรุป</p>
                      <p className="text-[11px] text-muted-foreground">
                        {meeting.summaryDraftId ? "สร้างแล้ว — ดูได้ที่รายการเอกสาร" : "รอ transcript ก่อน แล้วกดสร้าง"}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={summaryBusy || meeting.transcriptStatus !== "ready"}
                    onClick={generateSummary}
                    title={meeting.transcriptStatus !== "ready" ? "ต้องได้รับ Transcript ก่อน" : undefined}
                  >
                    {summaryBusy
                      ? <><span className="material-symbols-outlined animate-spin text-[14px] mr-1">progress_activity</span>กำลังสร้าง...</>
                      : "สร้างร่างรายงาน"}
                  </Button>
                </div>

                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">info</span>
                  ร่างนี้สร้างโดย AI อัตโนมัติ — เลขานุการต้องตรวจสอบ แก้ไข และรับรองก่อนใช้งานจริง
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* PERMISSIONS */}
        <TabsContent value="permissions" className="mt-4 space-y-3">
          <Card className="card-shadow">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">บริหารจัดการสิทธิ์</CardTitle>
                <CardDescription className="text-xs">สิทธิ์การเข้าถึงมี 2 ประเภท: ผู้จัดการประชุม และ ผู้อ่าน</CardDescription>
              </div>
              {canManagePermissions && (
                <Button size="sm" onClick={() => setAddPermOpen(true)}>
                  <span className={iconSm}>person_add</span> เพิ่มสิทธิ์
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 px-2">ผู้ใช้งาน</th>
                      <th className="text-left py-2 px-2">ประเภทสิทธิ์</th>
                      <th className="text-right py-2 px-2">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meeting.permissions.map((p, i) => (
                      <tr key={i} className="border-b last:border-b-0 hover:bg-muted/40">
                        <td className="py-2 px-2">{p.name}</td>
                        <td className="py-2 px-2">
                          <Badge className={p.type === "manager" ? "bg-primary/15 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border"} variant="secondary">
                            {p.type === "manager" ? "ผู้จัดการประชุม" : "ผู้อ่าน"}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={!canManagePermissions}
                            title={`ลบสิทธิ์ของ ${p.name}`}
                            onClick={() => removePermission(i)}
                          >
                            <span className={iconSm}>delete</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Secret Groups */}
          <Card className="card-shadow">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">กลุ่มชั้นความลับ</CardTitle>
                <CardDescription className="text-xs">กำหนดกลุ่มที่มีสิทธิ์อ่านวาระลับ</CardDescription>
              </div>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setSecretGroupOpen(true)}>
                  <span className={iconSm}>lock</span> สร้างกลุ่มชั้นความลับ
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {meeting.secretGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">ยังไม่มีกลุ่มชั้นความลับ</p>
              ) : (
                <div className="space-y-2">
                  {meeting.secretGroups.map(g => (
                    <div key={g.id} className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={iconSm + " text-amber-600"}>lock</span>
                        <p className="text-sm font-semibold">{g.name}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {g.participantIds.map(pid => {
                          const p = meeting.participants.find(x => x.id === pid);
                          return p ? <Badge key={pid} variant="secondary" className="text-[10px]">{p.name}</Badge> : null;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* INFO */}
        <TabsContent value="info" className="mt-4 space-y-3">
          <Card className="card-shadow">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">ข้อมูลการประชุม</CardTitle>
                <CardDescription className="text-xs">เมนูสำหรับผู้จัดการประชุมเท่านั้น</CardDescription>
              </div>
              {canEdit && (
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => setTextBoxesOpen(true)}>
                    <span className={iconSm}>add_box</span> จัดการกล่องข้อความเพิ่มเติม
                  </Button>
                  <Button size="sm" onClick={openEditInfo}>
                    <span className={iconSm}>edit</span> จัดการข้อมูลการประชุม
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">ชื่อการประชุม</p>
                  <p className="font-medium">{meeting.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">ชื่อย่อ</p>
                  <p className="font-medium">{meeting.shortName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">ประเภทการประชุม</p>
                  <p className="font-medium">{meeting.type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">คณะทำงาน</p>
                  <p className="font-medium">{meeting.committee}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">ผู้จัดการประชุม</p>
                  <p className="font-medium">{meeting.organizer}</p>
                  <p className="text-xs text-muted-foreground">{meeting.organizerEmail}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">รูปแบบการแสดงชื่อ</p>
                  <p className="font-medium">รูปแบบที่ {meeting.displayFormat}: {displayFormats.find(f => f.id === meeting.displayFormat)?.label}</p>
                  <p className="text-xs text-muted-foreground italic">ตัวอย่าง: {displayFormats.find(f => f.id === meeting.displayFormat)?.example}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">ชื่อผู้ส่ง Email</p>
                  <p className="font-medium">{emailSender}</p>
                  <p className="text-xs text-muted-foreground">(อีเมลระบบ: notify@e-office.cloud)</p>
                </div>
                <div className="md:col-span-2 rounded-lg border p-3 bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium mb-0.5">เปิดให้บุคคลภายนอกเข้าห้องประชุมเองได้</p>
                      <p className="text-[11px] text-muted-foreground">
                        เปิดเมื่อมีวิทยากรหรือผู้ทรงคุณวุฒิภายนอกที่ไม่มีบัญชีในระบบ —
                        ผู้ที่ได้รับลิงก์จะกรอกชื่อแล้วเข้าห้องได้เลย
                        {!meeting.allowGuestJoin && " ขณะนี้ปิดอยู่ เข้าได้เฉพาะองค์ประชุมเท่านั้น"}
                      </p>
                    </div>
                    <Switch
                      checked={!!meeting.allowGuestJoin}
                      disabled={!canEdit}
                      onCheckedChange={(v) => {
                        updateMeeting(meeting.id, { allowGuestJoin: v });
                        toast.success(v ? "เปิดให้บุคคลภายนอกเข้าร่วมได้แล้ว" : "ปิดรับบุคคลภายนอกแล้ว");
                      }}
                    />
                  </div>
                </div>

                {/* ─── Magic Link Invite Section ─── */}
                {meeting.allowGuestJoin && canEdit && (
                  <div className="md:col-span-2 rounded-lg border p-3 bg-primary/5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-primary">link</span>
                      <p className="text-xs font-semibold">เชิญบุคคลภายนอกผ่าน Magic Link</p>
                    </div>

                    {/* Invite form */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="Email ผู้รับเชิญ *"
                        type="email"
                        className="h-9 text-sm flex-1"
                      />
                      <Input
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        placeholder="ชื่อ (ไม่บังคับ)"
                        className="h-9 text-sm sm:w-44"
                      />
                      <Button size="sm" onClick={handleSendInvite} className="h-9 px-4 flex-shrink-0">
                        <span className="material-symbols-outlined text-[16px] mr-1">send</span>
                        สร้างลิงก์เชิญ
                      </Button>
                    </div>

                    {/* Existing tokens */}
                    {inviteTokens.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-muted-foreground font-medium">ลิงก์ที่สร้างแล้ว ({inviteTokens.length})</p>
                        <div className="space-y-1">
                          {inviteTokens.map((t) => (
                            <div key={t.token} className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] ${t.used ? "bg-muted/50 opacity-60" : "bg-background"}`}>
                              <span className="material-symbols-outlined text-[14px] text-muted-foreground">
                                {t.used ? "check_circle" : "link"}
                              </span>
                              <span className="truncate flex-1 font-medium">{t.guestEmail}</span>
                              {t.guestName && <span className="text-muted-foreground">({t.guestName})</span>}
                              <span className="text-muted-foreground flex-shrink-0">
                                {t.used ? "ใช้แล้ว" : `หมดอายุ ${new Date(t.expiresAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                              </span>
                              {!t.used && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5"
                                    onClick={() => handleCopyLink(t.token)}
                                    title="คัดลอกลิงก์"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">
                                      {copiedToken === t.token ? "check" : "content_copy"}
                                    </span>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5"
                                    onClick={() => setShowEmailPreview(t)}
                                    title="ดูตัวอย่าง Email"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">visibility</span>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5 text-destructive hover:text-destructive"
                                    onClick={() => handleRevokeToken(t.token)}
                                    title="ยกเลิก"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                  </Button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-[10px] text-muted-foreground">
                      ลิงก์ใช้ได้ครั้งเดียว หมดอายุ 48 ชม. · ในระบบจริงจะส่ง Email อัตโนมัติ · ตอนนี้คัดลอกลิงก์ส่งเองได้
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground mb-1">การเก็บบันทึกลง Drive</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${meeting.savedToDrive ? "bg-green-500" : "bg-slate-400"}`} />
                    <p className="font-medium">{meeting.savedToDrive ? "บันทึกแล้ว" : "รอบันทึก"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">กล่องข้อความเพิ่มเติมสำหรับใส่ข้อมูลในวาระ</p>
                  {textBoxes.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">ยังไม่มีกล่องข้อความ</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {textBoxes.map(b => (
                        <Badge key={b.id} variant="secondary" className="text-[10px]">{b.name}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {(meeting.zoomRoomDevices ?? []).length > 0 && (
            <Card className="card-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">อุปกรณ์ห้อง</CardTitle>
                <CardDescription className="text-xs">สถานะการเชื่อมต่อ Zoom Room ของห้องประชุมนี้</CardDescription>
              </CardHeader>
              <CardContent>
                <ZoomRoomStatus devices={meeting.zoomRoomDevices ?? []} />
              </CardContent>
            </Card>
          )}

        </TabsContent>
      </Tabs>

      {/* Notify Dialog — Enhanced */}
      <Dialog open={notifyDialog} onOpenChange={(open) => { setNotifyDialog(open); if (!open) setNotifyPreviewStep("config"); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>แจ้งวาระการประชุม</DialogTitle>
            <DialogDescription>ส่ง Email รายละเอียดวาระ + ปฏิทิน (.ics) ไปยังองค์ประชุมทั้งหมด</DialogDescription>
          </DialogHeader>

          {notifyPreviewStep === "config" ? (
            <>
            <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0">
              {/* ผู้รับ — คนในระบบ */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">group</span>
                  ผู้ใช้ในระบบ ({systemParticipants.length} คน)
                </label>
                <div className="rounded-md border p-2 bg-muted/30 max-h-28 overflow-y-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {systemParticipants.map(p => (
                      <Badge key={p.id} variant="secondary" className="text-[11px] gap-1">
                        <span className="material-symbols-outlined text-[12px]">person</span>
                        {p.name}
                        <span className="text-muted-foreground">({p.email})</span>
                      </Badge>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">ระบบดึงอีเมลจากข้อมูลผู้ใช้อัตโนมัติ + แสดงแจ้งเตือนในหน้าพอร์ทัลของแต่ละคน</p>
              </div>

              {/* ผู้รับ — บุคคลภายนอก */}
              {externalParticipants.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">person_add</span>
                    บุคคลภายนอก ({externalParticipants.length} คน) — ส่ง Magic Link
                  </label>
                  <div className="rounded-md border p-2 bg-amber-50/50 dark:bg-amber-950/20 max-h-28 overflow-y-auto">
                    <div className="flex flex-wrap gap-1.5">
                      {externalParticipants.map(p => (
                        <Badge key={p.id} variant="outline" className="text-[11px] gap-1 border-amber-300 text-amber-700 dark:text-amber-400">
                          <span className="material-symbols-outlined text-[12px]">link</span>
                          {p.name}
                          {p.email !== "-" && <span className="text-muted-foreground">({p.email})</span>}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">ผู้ใช้ภายนอกจะได้รับ Magic Link เข้าประชุมโดยไม่ต้องสร้างบัญชี</p>
                </div>
              )}

              {/* สิ่งที่จะส่ง */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">สิ่งที่จะส่งในอีเมล</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/20">
                    <span className="material-symbols-outlined text-[18px] text-primary">description</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">รายละเอียดวาระการประชุม</p>
                      <p className="text-[11px] text-muted-foreground">{meeting.agenda.length} วาระ · {meeting.date} · {meeting.startTime}-{meeting.endTime} · {meeting.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/20">
                    <span className="material-symbols-outlined text-[18px] text-blue-600">calendar_add_on</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">ไฟล์ปฏิทิน (.ics)</p>
                      <p className="text-[11px] text-muted-foreground">ผู้รับกดเพิ่มลง Google Calendar / Outlook ได้ทันที · มี alarm แจ้ง 1 วันก่อน + 30 นาทีก่อน</p>
                    </div>
                    <Button variant="outline" size="sm" className="text-[11px] h-7" onClick={() => downloadIcs(meeting)}>
                      <span className="material-symbols-outlined text-[14px] mr-1">download</span>ทดลองดาวน์โหลด
                    </Button>
                  </div>
                  {meeting.conferenceLink && (
                    <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/20">
                      <span className="material-symbols-outlined text-[18px] text-green-600">video_call</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium">ลิงก์ประชุมออนไลน์</p>
                        <p className="text-[11px] text-muted-foreground break-all">{meeting.conferenceLink}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Reminder */}
              <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[18px] text-blue-600 mt-0.5">notifications_active</span>
                  <div>
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Reminder อัตโนมัติ</p>
                    <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80">
                      ระบบจะส่งอีเมลเตือนพร้อมลิงก์เข้าประชุม <strong>1 วันก่อนวันประชุม</strong> อัตโนมัติ
                      {meeting.reminderSentAt && (
                        <span className="ml-1 text-green-600">✓ ส่งแล้วเมื่อ {new Date(meeting.reminderSentAt).toLocaleString("th-TH")}</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

            </div>
            <DialogFooter className="gap-2 pt-2 border-t flex-shrink-0">
              <Button variant="outline" onClick={() => setNotifyDialog(false)}>ยกเลิก</Button>
              <Button variant="outline" onClick={() => setNotifyPreviewStep("preview")}>
                <span className={iconSm}>visibility</span>ดูตัวอย่างอีเมล
              </Button>
              <Button onClick={notifyAgenda}>
                <span className={iconSm}>send</span>ส่งแจ้งวาระ ({meeting.participants.length} คน)
              </Button>
            </DialogFooter>
            </>
          ) : (
            <>
            {/* Email Preview */}
            <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
              <div className="rounded-lg border bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
                {/* Email Header */}
                <div className="border-b px-4 py-3 bg-muted/30 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-muted-foreground w-12">From:</span>
                    <span>{meeting.emailSenderName} &lt;notify@e-office.cloud&gt;</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-muted-foreground w-12">To:</span>
                    <span className="truncate">{meeting.participants.map(p => p.email).filter(e => e !== "-").join(", ") || "ผู้เข้าร่วมทุกท่าน"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-muted-foreground w-12">Subject:</span>
                    <span className="font-medium">แจ้งวาระ: {meeting.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-muted-foreground w-12">แนบ:</span>
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <span className="material-symbols-outlined text-[12px]">event</span>
                      {meeting.shortName}.ics
                    </Badge>
                  </div>
                </div>

                {/* Email Body */}
                <div className="px-4 py-4 text-sm space-y-3">
                  <p>เรียน ผู้เข้าร่วมประชุมทุกท่าน</p>
                  <p>ขอเรียนเชิญเข้าร่วม<strong>{meeting.name}</strong></p>

                  <div className="rounded-md border px-3 py-2.5 bg-muted/20 space-y-1 text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[14px] text-muted-foreground">calendar_today</span>
                      <span>วันที่: <strong>{meeting.date}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[14px] text-muted-foreground">schedule</span>
                      <span>เวลา: <strong>{meeting.startTime} - {meeting.endTime} น.</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[14px] text-muted-foreground">place</span>
                      <span>สถานที่: <strong>{meeting.location}</strong></span>
                    </div>
                    {meeting.conferenceLink && (
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[14px] text-muted-foreground">video_call</span>
                        <span>ประชุมออนไลน์: <span className="text-blue-600 underline">{meeting.conferenceLink.slice(0, 50)}…</span></span>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="font-medium mb-1.5">วาระการประชุม:</p>
                    <ol className="list-none space-y-1 text-[13px]">
                      {meeting.agenda.map(a => (
                        <li key={a.id} className="flex items-start gap-2">
                          <Badge variant="outline" className="text-[10px] mt-0.5 flex-shrink-0">{a.no}</Badge>
                          <span>{a.title}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-[12px] text-blue-700 dark:text-blue-400">
                    <span className="material-symbols-outlined text-[14px] align-middle mr-1">calendar_add_on</span>
                    กดไฟล์แนบ <strong>{meeting.shortName}.ics</strong> เพื่อเพิ่มกิจกรรมลงปฏิทินของท่านอัตโนมัติ
                  </div>

                  <hr />
                  <p className="text-[11px] text-muted-foreground">
                    อีเมลนี้ส่งจากระบบ e-Meeting อัตโนมัติ · ระบบจะส่งเตือนอีกครั้ง 1 วันก่อนวันประชุม พร้อมลิงก์เข้าห้องประชุม
                  </p>
                </div>
              </div>

            </div>
            <DialogFooter className="gap-2 pt-2 border-t flex-shrink-0">
              <Button variant="outline" onClick={() => setNotifyPreviewStep("config")}>
                <span className={iconSm}>arrow_back</span>กลับ
              </Button>
              <Button onClick={notifyAgenda}>
                <span className={iconSm}>send</span>ส่งแจ้งวาระ ({meeting.participants.length} คน)
              </Button>
            </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Endorse Dialog */}
      <Dialog open={endorseDialog} onOpenChange={setEndorseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยืนยันการรับรองการประชุม</DialogTitle>
            <DialogDescription className="text-amber-600">
              เมื่อรับรองแล้ว จะไม่สามารถแก้ไขรายละเอียดใดๆ ของการประชุมนี้ได้อีก
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndorseDialog(false)}>ยกเลิก</Button>
            <Button onClick={endorseMeeting}><span className={iconSm}>verified</span>ยืนยันการรับรอง</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add participant */}
      <Dialog open={addParticipantOpen} onOpenChange={(open) => {
        setAddParticipantOpen(open);
        if (!open) { setSelectedUserIds([]); setSelectedUsersPos({}); setParticipantSearch(""); setParticipantName(""); setParticipantPos("กรรมการ"); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>เพิ่มองค์ประชุม</DialogTitle>
            <DialogDescription>เลือกจากผู้ใช้ในระบบ หรือเพิ่มบุคคลภายนอก</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="system" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="system" className="flex-1 gap-1">
                <span className="material-symbols-outlined text-[16px]">group</span>
                ผู้ใช้ในระบบ
              </TabsTrigger>
              <TabsTrigger value="external" className="flex-1 gap-1">
                <span className="material-symbols-outlined text-[16px]">person_add</span>
                บุคคลภายนอก
              </TabsTrigger>
            </TabsList>

            <TabsContent value="system" className="mt-3 space-y-3">
              <div className="relative">
                <span className="material-symbols-outlined text-[18px] text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2">search</span>
                <Input
                  value={participantSearch}
                  onChange={e => setParticipantSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ ตำแหน่ง หน่วยงาน..."
                  className="pl-9"
                />
              </div>

              <div className="border rounded-lg max-h-[280px] overflow-y-auto">
                {filteredUsers.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    <span className="material-symbols-outlined text-[28px] block mb-1">person_off</span>
                    {participantSearch ? "ไม่พบผู้ใช้ที่ตรงกับคำค้น" : "ผู้ใช้ทั้งหมดอยู่ในที่ประชุมแล้ว"}
                  </div>
                ) : (
                  filteredUsers.map(u => {
                    const selected = selectedUserIds.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        className={`flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 cursor-pointer transition-colors ${selected ? "bg-primary/5" : "hover:bg-muted/50"}`}
                        onClick={() => toggleUserSelection(u.id)}
                      >
                        <div className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                          {selected && <span className="material-symbols-outlined text-[14px] text-primary-foreground">check</span>}
                        </div>
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-primary text-xs font-semibold">{u.name.charAt(u.name.indexOf(" ") + 1)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{u.position} · {u.department}</p>
                        </div>
                        {selected && (
                          <select
                            className="border rounded px-1.5 py-0.5 text-[11px] bg-transparent flex-shrink-0"
                            value={selectedUsersPos[u.id] || "กรรมการ"}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setSelectedUsersPos(prev => ({ ...prev, [u.id]: e.target.value }))}
                          >
                            <option>ประธาน</option>
                            <option>รองประธาน</option>
                            <option>กรรมการ</option>
                            <option>เลขานุการ</option>
                            <option>ผู้เข้าร่วม</option>
                            <option>ที่ปรึกษา</option>
                          </select>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {selectedUserIds.length > 0 && (
                <p className="text-xs text-muted-foreground">เลือกแล้ว {selectedUserIds.length} คน</p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setAddParticipantOpen(false)}>ยกเลิก</Button>
                <Button onClick={addSelectedSystemUsers} disabled={selectedUserIds.length === 0}>
                  <span className="material-symbols-outlined text-[16px] mr-1">group_add</span>
                  เพิ่ม {selectedUserIds.length > 0 ? `${selectedUserIds.length} คน` : "ผู้ใช้ที่เลือก"}
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="external" className="mt-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ชื่อ - สกุล</label>
                <Input value={participantName} onChange={e => setParticipantName(e.target.value)} placeholder="เช่น นาย สมชาย ใจดี" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ตำแหน่งในที่ประชุม</label>
                <select className="w-full border rounded px-2 h-9 text-sm bg-transparent" value={participantPos} onChange={e => setParticipantPos(e.target.value)}>
                  <option>ประธาน</option>
                  <option>รองประธาน</option>
                  <option>กรรมการ</option>
                  <option>เลขานุการ</option>
                  <option>ผู้เข้าร่วม</option>
                  <option>ที่ปรึกษา</option>
                </select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddParticipantOpen(false)}>ยกเลิก</Button>
                <Button onClick={addExternalParticipant}>
                  <span className="material-symbols-outlined text-[16px] mr-1">person_add</span>
                  เพิ่มบุคคลภายนอก
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Add File */}
      <Dialog open={addFileOpen} onOpenChange={setAddFileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>อัปโหลดไฟล์</DialogTitle>
            <DialogDescription>อัปโหลดไฟล์ระเบียบ/คำสั่ง หรือเอกสารประกอบการประชุม</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center bg-muted/20">
              <span className="material-symbols-outlined text-primary text-[36px] mb-2">cloud_upload</span>
              {fileName ? (
                <>
                  <p className="text-sm font-medium truncate">{fileName}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {fileSizeKb !== null ? `${fileSizeKb.toLocaleString()} KB` : "ระบุขนาดอัตโนมัติ"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">เลือกไฟล์จากเครื่อง หรือพิมพ์ชื่อเอกสารด้านล่าง</p>
                  <p className="text-xs text-muted-foreground mt-1">รองรับ PDF, DOCX, XLSX</p>
                </>
              )}
              {/* เลือกไฟล์แล้วจะบันทึกจริงลง IndexedDB ตอนกด "บันทึก" */}
              <input
                ref={filePickerRef}
                type="file"
                accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 20 * 1024 * 1024) {
                    toast.error("ไฟล์เกิน 20 MB");
                    return;
                  }
                  setPendingFile(f);
                  setFileName(f.name);
                  setFileSizeKb(Math.max(1, Math.round(f.size / 1024)));
                }}
              />
              <Button
                size="sm"
                variant="outline"
                type="button"
                className="mt-3"
                onClick={() => filePickerRef.current?.click()}
              >
                {fileName ? "เปลี่ยนไฟล์" : "เลือกไฟล์"}
              </Button>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                ชื่อเอกสาร<span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="เช่น ระเบียบวาระการประชุม 8-2569.pdf"
                value={fileName}
                onChange={e => setFileName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ประเภทเอกสาร</label>
                <Select value={fileType} onValueChange={v => setFileType(v as MeetingFile["type"])}>
                  <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(fileTypeLabels) as MeetingFile["type"][]).map(t => (
                      <SelectItem key={t} value={t}>{fileTypeLabels[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ใครเห็นเอกสารนี้ได้</label>
                <Select value={fileVisibility} onValueChange={v => setFileVisibility(v as FileVisibility)}>
                  <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(fileVisibilityLabels) as FileVisibility[]).map(v => (
                      <SelectItem key={v} value={v}>{fileVisibilityLabels[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">คำอธิบายไฟล์</label>
              <Input placeholder="อธิบายไฟล์นี้..." value={fileDesc} onChange={e => setFileDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeFileDialog}>ยกเลิก</Button>
            <Button onClick={submitFile} disabled={uploading}>
              {uploading ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Display Format */}
      <Dialog open={displayFormatOpen} onOpenChange={setDisplayFormatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>รูปแบบการแสดงชื่อและหน่วยงาน</DialogTitle>
            <DialogDescription>เลือกรูปแบบการแสดงรายชื่อผู้เข้าร่วม (มี 6 รูปแบบ)</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {displayFormats.map(f => (
              <label key={f.id} className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer hover:border-primary ${meeting.displayFormat === f.id ? "border-primary bg-primary/5" : ""}`}>
                <input type="radio" checked={meeting.displayFormat === f.id} onChange={() => updateMeeting(meeting.id, { displayFormat: f.id })} className="mt-0.5 accent-primary" />
                <div>
                  <p className="text-sm font-medium">รูปแบบที่ {f.id}: {f.label}</p>
                  <p className="text-xs text-muted-foreground italic mt-0.5">ตัวอย่าง: {f.example}</p>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => { setDisplayFormatOpen(false); toast.success("บันทึกรูปแบบเรียบร้อย"); }}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Sender */}
      <Dialog open={emailSenderOpen} onOpenChange={setEmailSenderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ตั้งค่าชื่อผู้ส่งอีเมล</DialogTitle>
            <DialogDescription>ผู้รับจะเห็นชื่อนี้เมื่อได้รับ email แจ้งวาระ/รับรอง (อีเมลระบบยังคงเป็น notify@e-office.cloud)</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">ชื่อผู้ส่ง</label>
            <Input value={emailSender} onChange={e => setEmailSender(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailSenderOpen(false)}>ยกเลิก</Button>
            <Button onClick={() => { updateMeeting(meeting.id, { emailSenderName: emailSender }); setEmailSenderOpen(false); toast.success("บันทึกเรียบร้อย"); }}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret Group */}
      <Dialog open={secretGroupOpen} onOpenChange={setSecretGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              สร้างกลุ่มชั้นความลับ
              <ComingSoonBadge reason="อยู่ระหว่างพัฒนา" />
            </DialogTitle>
            <DialogDescription>เลือกองค์ประชุมที่สามารถเข้าถึงวาระลับได้</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 opacity-60 pointer-events-none">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ชื่อกลุ่มชั้นความลับ</label>
              <Input placeholder="เช่น กลุ่มลับ — เรื่องบุคคล" disabled />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">เลือกองค์ประชุมในกลุ่ม</label>
              <div className="border rounded p-2 max-h-48 overflow-y-auto space-y-1">
                {meeting.participants.map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-sm py-1">
                    <input type="checkbox" className="accent-primary" disabled /> {p.name} <span className="text-xs text-muted-foreground">({p.position})</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground border-t pt-3">
            ฟีเจอร์นี้ยังไม่เปิดใช้งาน — ขณะนี้ควบคุมการเข้าถึงเอกสารลับได้ที่แท็บ &quot;ไฟล์เอกสาร&quot; ผ่านการตั้งค่าระดับการมองเห็น
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecretGroupOpen(false)}>ปิด</Button>
            <ComingSoon reason="อยู่ระหว่างพัฒนา">
              <Button disabled>บันทึก</Button>
            </ComingSoon>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* จัดการข้อมูลการประชุม (แก้ชื่อ/ชื่อย่อ/ประเภท) */}
      <Dialog open={editInfoOpen} onOpenChange={setEditInfoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>จัดการข้อมูลการประชุม</DialogTitle>
            <DialogDescription>แก้ไขชื่อการประชุม ชื่อย่อ และประเภทการประชุม</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ชื่อการประชุม<span className="text-destructive">*</span></label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ชื่อย่อการประชุม</label>
              <Input value={editShortName} onChange={e => setEditShortName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ประเภทการประชุม</label>
              <select className="w-full border rounded-md px-2 h-9 text-sm bg-transparent" value={editType} onChange={e => setEditType(e.target.value)}>
                <option>การประชุมคณะกรรมการ</option>
                <option>การประชุมคณะทำงาน</option>
                <option>การประชุมภายในทีม</option>
                <option>การประชุมวิสามัญ</option>
                <option>การประชุมสามัญประจำปี</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditInfoOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveInfo}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* จัดการกล่องข้อความเพิ่มเติมสำหรับใส่ข้อมูลในวาระ */}
      <Dialog open={textBoxesOpen} onOpenChange={setTextBoxesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>จัดการกล่องข้อความเพิ่มเติม</DialogTitle>
            <DialogDescription>เพิ่ม แก้ไขชื่อ หรือลบกล่องข้อความสำหรับใส่ข้อมูลในวาระการประชุม</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {textBoxes.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">ยังไม่มีกล่องข้อความ</p>
            )}
            {textBoxes.map(b => (
              <div key={b.id} className="flex items-center gap-2">
                <Input
                  value={b.name}
                  onChange={e => setTextBoxes(prev => prev.map(x => x.id === b.id ? { ...x, name: e.target.value } : x))}
                  className="h-9"
                />
                <Button size="icon-sm" variant="ghost" className="shrink-0 text-destructive" onClick={() => setTextBoxes(prev => prev.filter(x => x.id !== b.id))}>
                  <span className={iconSm}>delete</span>
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Input
                value={newBoxName}
                onChange={e => setNewBoxName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newBoxName.trim()) {
                    setTextBoxes(prev => [...prev, { id: `TB-${Date.now()}`, name: newBoxName.trim() }]);
                    setNewBoxName("");
                  }
                }}
                placeholder="ชื่อกล่องข้อความใหม่ เช่น มติที่ประชุม"
                className="h-9"
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => {
                  if (!newBoxName.trim()) return;
                  setTextBoxes(prev => [...prev, { id: `TB-${Date.now()}`, name: newBoxName.trim() }]);
                  setNewBoxName("");
                }}
              >
                <span className={iconSm}>add</span> เพิ่ม
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTextBoxes(meeting.extraTextBoxes || []); setTextBoxesOpen(false); }}>ยกเลิก</Button>
            <Button onClick={() => {
              // เดิมปุ่มนี้แค่ขึ้น toast — ที่แก้ไปหายทุกครั้งที่ reload
              updateMeeting(meeting.id, { extraTextBoxes: textBoxes });
              setTextBoxesOpen(false);
              toast.success("บันทึกกล่องข้อความเรียบร้อย");
            }}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* เปิดประชุม — ยืนยันเวลาการประชุม */}
      <Dialog open={openTimeDialog} onOpenChange={setOpenTimeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยืนยันเวลาการประชุม</DialogTitle>
            <DialogDescription>กำหนดเวลาเริ่มต้นไว้ {meeting.startTime} น. — เลือกวิธียืนยันเวลาเริ่มประชุม</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 py-2">
            <button onClick={() => confirmOpenMeeting(true)} className="rounded-xl border p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors">
              <span className="material-symbols-outlined text-primary mb-1">update</span>
              <p className="text-sm font-semibold">แก้ไขเป็นเวลาปัจจุบัน</p>
              <p className="text-xs text-muted-foreground mt-1">ให้ระบบแก้ไขเวลาเริ่มต้นประชุมเป็นเวลาที่คลิกปุ่มนี้</p>
            </button>
            <button onClick={() => confirmOpenMeeting(false)} className="rounded-xl border p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors">
              <span className="material-symbols-outlined text-primary mb-1">event</span>
              <p className="text-sm font-semibold">ยืนยันเวลาที่กำหนดไว้</p>
              <p className="text-xs text-muted-foreground mt-1">ยืนยันตามกำหนดเวลาเริ่มต้นเดิม {meeting.startTime} น.</p>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* แจ้งรับรองการประชุม — Template Email */}
      <Dialog open={endorseNotifyOpen} onOpenChange={setEndorseNotifyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>แจ้งรับรองการประชุม</DialogTitle>
            <DialogDescription>ส่ง Email ให้องค์ประชุมเข้ามารับรองการประชุม (แก้ไขผู้รับ, CC, ชื่อเรื่อง และเนื้อหาได้)</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ผู้รับ ({meeting.participants.length} คน)</label>
              <div className="rounded-md border p-2 bg-muted/30 max-h-24 overflow-y-auto text-xs">
                {meeting.participants.length > 0 ? meeting.participants.map(p => p.name).join(", ") : "ยังไม่มีองค์ประชุม"}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">CC</label>
              <Input placeholder="อีเมล CC เพิ่มเติม (คั่นด้วย ,)" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ชื่อเรื่อง</label>
              <Input defaultValue={`ขอเชิญรับรองรายงานการประชุม: ${meeting.name}`} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">เนื้อหา Email</label>
              <Textarea
                rows={4}
                defaultValue={`เรียน องค์ประชุมทุกท่าน\n\nขอเชิญเข้าระบบเพื่อรับรองรายงานการประชุม ${meeting.name} เมื่อวันที่ ${fmtDate(meeting.date)}\n\nจาก ${meeting.emailSenderName} (notify@e-office.cloud)`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndorseNotifyOpen(false)}>ยกเลิก</Button>
            <Button onClick={sendEndorseEmail}><span className={iconSm}>send</span>ส่ง Email</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* เพิ่มสิทธิ์ */}
      <Dialog open={addPermOpen} onOpenChange={setAddPermOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มสิทธิ์</DialogTitle>
            <DialogDescription>เลือกประเภทสิทธิ์ แล้วพิมพ์ชื่อผู้ใช้งาน ระบบจะดึงรายชื่อที่มีในระบบมาแสดง</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ประเภทสิทธิ์</label>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${permType === "reader" ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}>
                  <input type="radio" checked={permType === "reader"} onChange={() => setPermType("reader")} className="accent-primary" />
                  <div>
                    <p className="text-sm font-medium">สิทธิ์ผู้อ่าน</p>
                    <p className="text-[11px] text-muted-foreground">อ่านวาระและเอกสารได้</p>
                  </div>
                </label>
                <label className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${permType === "manager" ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}>
                  <input type="radio" checked={permType === "manager"} onChange={() => setPermType("manager")} className="accent-primary" />
                  <div>
                    <p className="text-sm font-medium">สิทธิ์ผู้จัดประชุม</p>
                    <p className="text-[11px] text-muted-foreground">จัดการการประชุมได้ทั้งหมด</p>
                  </div>
                </label>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ชื่อผู้ใช้งาน</label>
              <Input
                value={permName}
                onChange={e => setPermName(e.target.value)}
                placeholder="พิมพ์ชื่อเพื่อค้นหา..."
                list="system-users"
              />
              <datalist id="system-users">
                {meeting.participants.filter(p => p.inSystem).map(p => (
                  <option key={p.id} value={p.name} />
                ))}
                <option value="นาย เดชา เก่งจริง" />
                <option value="นางสาว ณิชา งามพร้อม" />
                <option value="นาย ภูมิ อาสา" />
              </datalist>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPermOpen(false)}>ยกเลิก</Button>
            <Button onClick={addPermission}>เพิ่มสิทธิ์</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* เพิ่มวาระ */}
      <Dialog open={addAgendaOpen} onOpenChange={setAddAgendaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มวาระการประชุม</DialogTitle>
            <DialogDescription>ระบุลำดับวาระ เช่น 5 หรือ 3.3 สำหรับวาระย่อย</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-[100px_1fr] gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ลำดับ</label>
                <Input value={agendaNo} onChange={e => setAgendaNo(e.target.value)} placeholder="เช่น 5" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ชื่อวาระ<span className="text-destructive">*</span></label>
                <Input value={agendaTitle} onChange={e => setAgendaTitle(e.target.value)} placeholder="เช่น เรื่องเพื่อทราบ" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">รายละเอียด</label>
              <Textarea rows={3} value={agendaDetail} onChange={e => setAgendaDetail(e.target.value)} placeholder="รายละเอียดวาระ..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAgendaOpen(false)}>ยกเลิก</Button>
            <Button onClick={addAgenda}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* บังคับจัดการองค์ประชุมเมื่อเข้ากล่องประชุมครั้งแรก */}
      <Dialog open={forceParticipants} onOpenChange={setForceParticipants}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>จัดการรายชื่อองค์ประชุมชุดปัจจุบัน</DialogTitle>
            <DialogDescription>
              การประชุมนี้ยังไม่มีองค์ประชุม กรุณาจัดการรายชื่อองค์ประชุมชุดปัจจุบันก่อนดำเนินการขั้นตอนอื่น
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => { setForceParticipants(false); setAddParticipantOpen(true); }}>
              <span className={iconSm}>person_add</span>จัดการรายชื่อ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewFile && (
        <DocumentLightbox
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          currentPage={previewPage}
          setCurrentPage={setPreviewPage}
          zoom={previewZoom}
          setZoom={setPreviewZoom}
          viewerName={currentUser.name}
          confidentialityLevel={meeting.confidentialityLevel ?? "normal"}
        />
      )}

      {/* Magic Link — Email Preview Dialog */}
      <Dialog open={!!showEmailPreview} onOpenChange={(v) => !v && setShowEmailPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">mail</span>
              ตัวอย่าง Email เชิญประชุม
            </DialogTitle>
            <DialogDescription>
              ในระบบจริง Email นี้จะถูกส่งอัตโนมัติ · ตอนนี้คัดลอกลิงก์ส่งเองได้
            </DialogDescription>
          </DialogHeader>
          {showEmailPreview && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border bg-background overflow-hidden">
                {/* Email header */}
                <div className="border-b px-4 py-2 bg-muted/30 space-y-1 text-xs">
                  <div className="flex gap-2"><span className="text-muted-foreground w-12">From:</span><span className="font-medium">e-Meeting &lt;notify@e-office.cloud&gt;</span></div>
                  <div className="flex gap-2"><span className="text-muted-foreground w-12">To:</span><span className="font-medium">{showEmailPreview.guestEmail}</span></div>
                  <div className="flex gap-2"><span className="text-muted-foreground w-12">Subject:</span><span className="font-medium">คุณได้รับเชิญเข้าร่วมประชุม: {meeting.name}</span></div>
                </div>
                {/* Email body */}
                <div className="p-4 text-sm space-y-3">
                  <p>เรียน {showEmailPreview.guestName || showEmailPreview.guestEmail}</p>
                  <p>
                    {meeting.organizer} ขอเชิญท่านเข้าร่วมประชุม <strong>{meeting.name}</strong>
                  </p>
                  <div className="rounded-lg bg-muted/40 border p-3 space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                      วันที่: {meeting.date}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      เวลา: {meeting.startTime} - {meeting.endTime} น.
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[14px]">place</span>
                      สถานที่: {meeting.location}
                    </div>
                  </div>
                  <div className="py-2">
                    <Button
                      className="w-full"
                      onClick={() => handleCopyLink(showEmailPreview.token)}
                    >
                      <span className="material-symbols-outlined text-[16px] mr-1.5">
                        {copiedToken === showEmailPreview.token ? "check" : "link"}
                      </span>
                      {copiedToken === showEmailPreview.token ? "คัดลอกแล้ว!" : "คัดลอก Magic Link"}
                    </Button>
                    <p className="text-[10px] text-center text-muted-foreground mt-1.5">
                      {buildJoinUrl(showEmailPreview.token).replace(/^https?:\/\//, "")}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ลิงก์นี้ใช้ได้ครั้งเดียว หมดอายุภายใน 48 ชั่วโมง
                    <br />ท่านไม่จำเป็นต้องสร้างบัญชี — คลิกลิงก์แล้วกรอกชื่อเพื่อเข้าร่วม
                  </p>
                  <div className="border-t pt-2 text-[10px] text-muted-foreground">
                    ส่งจากระบบ e-Meeting · ระบบบริหารการประชุมและจองห้องประชุม
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailPreview(null)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
