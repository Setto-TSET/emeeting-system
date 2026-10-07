"use client";

import { useState, useRef, use, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { fetchGuestLink, rotateGuestLink, guestLinkUrl } from "@/services/api/guestLinks";
import { ApiError } from "@/services/api/client";
import { PageError, PageLoading } from "@/components/layout/PageState";
import { downloadIcs } from "@/lib/calendar";
import { summarizeMeeting } from "@/services/api/summarize";
import { buildReportMarkdown } from "@/services/summarize/reportBuilder";

const iconSm = "material-symbols-outlined text-base";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

const statusOrder: MeetingStatus[] = ["prepare", "notified", "in_progress", "waiting_endorse", "endorsed"];

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { meetings, loading, error, reload } = useMeetings();
  const meeting = meetings.find(m => m.id === id);

  // ระหว่างโหลดหรือโหลดไม่สำเร็จ ห้ามแสดงว่า "ไม่พบการประชุม" — ผู้ใช้จะเข้าใจว่าข้อมูลหาย
  if (!meeting && loading) return <PageLoading label="กำลังโหลดการประชุม..." />;
  if (!meeting && error) return <PageError message={error} onRetry={() => void reload()} />;

  // เดิมเป็น `|| meetings[0]` ซึ่งทำให้ URL ผิดแสดงประชุมแรกเงียบๆ
  // อันตรายเพราะผู้ใช้เข้าใจว่ากำลังดู/แก้ประชุมที่ต้องการ ทั้งที่เป็นคนละรายการ
  if (!meeting) {
    return (
      <div className="p-4 md:p-6 max-w-wide mx-auto">
        <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
          <span className="material-symbols-outlined text-5xl text-muted-foreground mb-2">search_off</span>
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
  const { updateMeeting, removeMeeting, addMeetingFile, addMeetingComment, reload } = useMeetings();
  const router = useRouter();
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState<MeetingFile["type"]>("attachment");
  const [fileVisibility, setFileVisibility] = useState<FileVisibility>("participants");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const filePickerRef = useRef<HTMLInputElement>(null);
  // เปิดอ่านเอกสารในเว็บ — ระบบไม่มีการดาวน์โหลดไฟล์ออก
  const [previewFile, setPreviewFile] = useState<MeetingFile | null>(null);
  const openFilePreview = (f: MeetingFile) => {
    setPreviewFile(f);
  };

  // ─── ลิงก์เชิญบุคคลภายนอก (ลิงก์เดียวต่อการประชุม) ───
  const [guestLink, setGuestLink] = useState<string | null>(null);
  const [guestLinkLoaded, setGuestLinkLoaded] = useState(false);
  const [guestLinkBusy, setGuestLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // 403 คือ "ไม่ใช่ผู้จัด" ไม่ใช่ข้อผิดพลาด — ผู้เข้าร่วมทั่วไปไม่เห็นส่วนนี้อยู่แล้ว
  useEffect(() => {
    let cancelled = false;
    fetchGuestLink(meeting.id)
      .then((token) => {
        if (!cancelled) setGuestLink(token);
      })
      .catch((e) => {
        if (cancelled) return;
        if (!(e instanceof ApiError) || (e.status !== 403 && e.status !== 401)) {
          toast.error(e instanceof ApiError ? e.message : "โหลดลิงก์เชิญไม่สำเร็จ");
        }
        setGuestLink(null);
      })
      .finally(() => {
        if (!cancelled) setGuestLinkLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [meeting.id]);

  // สร้างครั้งแรก หรือสร้างใหม่เพื่อยกเลิกลิงก์เดิม (เช่น ลิงก์หลุดไปถึงคนที่ไม่ควรได้)
  const handleRotateGuestLink = async () => {
    setGuestLinkBusy(true);
    try {
      const hadLink = guestLink !== null;
      setGuestLink(await rotateGuestLink(meeting.id));
      toast.success(hadLink ? "สร้างลิงก์ใหม่แล้ว — ลิงก์เดิมใช้ไม่ได้อีก" : "สร้างลิงก์เชิญแล้ว", {
        description: "คัดลอกลิงก์แล้วส่งให้บุคคลภายนอกที่ต้องการเชิญ",
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "สร้างลิงก์เชิญไม่สำเร็จ");
    } finally {
      setGuestLinkBusy(false);
    }
  };

  // clipboard ใช้ไม่ได้บน http (ไม่ใช่ https) หรือเมื่อเบราว์เซอร์ไม่อนุญาต — ต้องบอกให้คัดลอกเอง
  // ไม่งั้นขึ้นว่า "คัดลอกแล้ว" ทั้งที่ในคลิปบอร์ดไม่มีอะไร
  const handleCopyLink = async (token: string) => {
    const url = guestLinkUrl(token);
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("คัดลอกลิงก์แล้ว");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("คัดลอกอัตโนมัติไม่ได้ — กรุณาคัดลอกลิงก์นี้เอง", { description: url, duration: 10000 });
    }
  };

  // ─── ร่างรายงานสรุป — transcript มาจากคำบรรยายสดที่ server เก็บไว้ระหว่างประชุม ───
  const [summaryBusy, setSummaryBusy] = useState(false);

  const generateSummary = async () => {
    setSummaryBusy(true);
    try {
      const summary    = await summarizeMeeting(meeting.id);
      const mdContent  = buildReportMarkdown(meeting, summary);
      const mdBlob     = new Blob([mdContent], { type: "text/markdown; charset=utf-8" });
      const mdFile     = new File([mdBlob], "report_draft_summary.md", { type: "text/markdown" });
      const stored     = await putFile(mdFile, meeting.id);

      const draftFileId = `RF-${Date.now()}`;
      const now         = new Date();
      const uploadedAt  = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

      // ไฟล์กับ summaryDraftId บันทึกในครั้งเดียว — แยกสองครั้ง ถ้าครั้งหลังล้มจะได้ไฟล์ที่ไม่ผูกกับร่างรายงาน
      const saved = await updateMeeting(meeting.id, { summaryDraftId: draftFileId, files: [...meeting.files, {
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
      }] });
      if (saved) toast.success("สร้างร่างรายงานสรุปแล้ว", { description: "ดูได้ที่รายการเอกสารด้านบน" });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "สร้างรายงานไม่สำเร็จ");
    } finally {
      setSummaryBusy(false);
    }
  };

  const changeStatus = async (s: MeetingStatus) => {
    if (await updateMeeting(meeting.id, { status: s })) toast.success(`เปลี่ยนสถานะเป็น: ${meetingStatusLabels[s]}`);
  };

  const [notifyPreviewStep, setNotifyPreviewStep] = useState<"config" | "preview">("config");

  const systemParticipants = meeting.participants.filter(p => p.inSystem);
  const externalParticipants = meeting.participants.filter(p => !p.inSystem);

  const notifyAgenda = async () => {
    const extCount = externalParticipants.length;
  
    setNotifyDialog(false);
    setNotifyPreviewStep("config");

    const now = new Date().toISOString();
    if (!(await updateMeeting(meeting.id, { status: "notified", notifiedAt: now }))) return;

    // ระบบยังไม่มีบริการส่งอีเมล — ห้ามบอกว่า "ส่งแล้ว" ผู้จัดจะเข้าใจว่าองค์ประชุมได้รับแจ้งแล้ว
    toast.success("บันทึกการแจ้งวาระแล้ว", {
      description: `ผู้เข้าร่วมในระบบเห็นวาระในหน้าของตนแล้ว · ระบบยังไม่ส่งอีเมลอัตโนมัติ${extCount ? ` — ส่งลิงก์เชิญให้บุคคลภายนอก ${extCount} รายเอง (ส่วน "ข้อมูลการประชุม")` : ""}`,
      duration: 8000,
    });
  };

  const sendReminder = async () => {
    const now = new Date().toISOString();
    if (!(await updateMeeting(meeting.id, { reminderSentAt: now }))) return;
    toast.success("บันทึกเวลาแจ้งเตือนแล้ว", {
      description: "ระบบยังไม่ส่งอีเมลอัตโนมัติ — กรุณาแจ้งผู้เข้าร่วมทางช่องทางของหน่วยงาน",
      duration: 8000,
    });
  };

  const confirmOpenMeeting = async (useCurrentTime: boolean) => {
    const now = new Date();
    const nowStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setOpenTimeDialog(false);
    if (!(await updateMeeting(meeting.id, {
      status: "in_progress",
      startTime: useCurrentTime ? nowStr : meeting.startTime,
    }))) return;
    toast.success(useCurrentTime ? `เปิดการประชุมแล้ว (เวลาเริ่ม ${nowStr} น.)` : "เปิดการประชุมแล้ว (ตามเวลาที่กำหนดไว้)");
  };

  const closeMeeting = async () => {
    if (await updateMeeting(meeting.id, { status: "waiting_endorse" })) toast.success("ปิดการประชุมแล้ว รอการรับรอง");
  };

  const sendEndorseEmail = () => {
    setEndorseNotifyOpen(false);
    toast.info("ระบบยังไม่ส่งอีเมลอัตโนมัติ", { description: "กรุณาแจ้งผู้เข้าร่วมให้เข้ามาดูร่างรายงานในระบบด้วยตนเอง" });
  };

  const addPermission = async () => {
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
    setAddPermOpen(false);
    if (!(await updateMeeting(meeting.id, {
      permissions: [...meeting.permissions, { userId: target.id, name: target.name, type: permType }]
    }))) return;
    toast.success(`เพิ่มสิทธิ์${permType === "manager" ? "ผู้จัดการประชุม" : "ผู้อ่าน"}สำเร็จ`);
    setPermName(""); setPermType("reader");
  };

  const closeFileDialog = () => {
    setAddFileOpen(false);
    setFileName(""); setFileDesc("");
    setFileType("attachment"); setFileVisibility("participants");
    setPendingFile(null); setUploading(false);
  };

  const submitFile = async () => {
    const name = fileName.trim();
    // ต้องมีไฟล์จริงเสมอ — เดิมพิมพ์ชื่ออย่างเดียวได้ แล้วระบบสร้างรายการ ".pdf" ขนาดสุ่มที่เปิดไม่ได้
    if (!pendingFile) { toast.error("กรุณาเลือกไฟล์ที่จะอัปโหลด"); return; }
    if (!name) { toast.error("กรุณาระบุชื่อเอกสาร"); return; }

    setUploading(true);
    try {
      const stored = await putFile(pendingFile, meeting.id, fileVisibility);
      const ok = await addMeetingFile(meeting.id, {
        id: `F-${Date.now()}`,
        name,
        description: fileDesc.trim() || "เอกสารประกอบการประชุม",
        size: formatBytes(pendingFile.size),
        uploadedAt: today,
        uploadedBy: currentUser.name,
        type: fileType,
        visibility: fileVisibility,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
      });
      if (!ok) { setUploading(false); return; }
      toast.success("เพิ่มเอกสารเรียบร้อย", { description: `${name} · ${fileVisibilityLabels[fileVisibility]}` });
      closeFileDialog();
    } catch (e) {
      toast.error("อัปโหลดไฟล์ไม่สำเร็จ", { description: e instanceof ApiError ? e.message : "ตรวจสอบการเชื่อมต่อแล้วลองใหม่" });
      setUploading(false);
    }
  };

  const removePermission = async (index: number) => {
    const target = meeting.permissions[index];
    if (!(await updateMeeting(meeting.id, {
      permissions: meeting.permissions.filter((_, i) => i !== index)
    }))) return;
    toast.success(`ลบสิทธิ์ของ ${target.name} แล้ว`);
  };

  const addAgenda = async () => {
    if (!agendaTitle.trim()) { toast.error("กรุณากรอกชื่อวาระ"); return; }
    setAddAgendaOpen(false);
    if (!(await updateMeeting(meeting.id, {
      agenda: [...meeting.agenda, {
        id: `AG-${Date.now()}`,
        no: agendaNo.trim() || String(meeting.agenda.filter(a => !a.no.includes(".")).length + 1),
        title: agendaTitle.trim(),
        detail: agendaDetail.trim() || undefined,
        comments: [],
      }]
    }))) return;
    toast.success("เพิ่มวาระสำเร็จ");
    setAgendaNo(""); setAgendaTitle(""); setAgendaDetail("");
  };

  // ชื่อผู้แสดงความเห็นและเวลามาจาก server — ผู้เข้าร่วมทั่วไปส่งได้โดยไม่ต้องมีสิทธิ์แก้ทั้งการประชุม
  const submitComment = async (agendaId: string) => {
    if (!commentText.trim()) return;
    if (await addMeetingComment(meeting.id, agendaId, commentText.trim())) {
      setCommentText(""); setCommentFor(null);
    }
  };

  const saveInfo = async () => {
    if (!editName.trim()) { toast.error("กรุณากรอกชื่อการประชุม"); return; }
    setEditInfoOpen(false);
    if (await updateMeeting(meeting.id, { name: editName.trim(), shortName: editShortName.trim(), type: editType })) {
      toast.success("บันทึกข้อมูลการประชุมเรียบร้อย");
    }
  };

  const openEditInfo = () => {
    setEditName(meeting.name);
    setEditShortName(meeting.shortName);
    setEditType(meeting.type);
    setEditInfoOpen(true);
  };

  const endorseMeeting = async () => {
    setEndorseDialog(false);
    if (await updateMeeting(meeting.id, { status: "endorsed" })) toast.success("รับรองการประชุมแล้ว — ไม่สามารถแก้ไขได้อีก");
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

  const addExternalParticipant = async () => {
    if (!participantName.trim()) { toast.error("กรุณากรอกชื่อ"); return; }
    setAddParticipantOpen(false);
    if (!(await updateMeeting(meeting.id, {
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
    }))) return;
    toast.success("เพิ่มองค์ประชุมสำเร็จ");
    setParticipantName(""); setParticipantPos("กรรมการ");
  };

  const addSelectedSystemUsers = async () => {
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
    setAddParticipantOpen(false);
    if (!(await updateMeeting(meeting.id, {
      participants: [...meeting.participants, ...newParticipants]
    }))) return;
    toast.success(`เพิ่มองค์ประชุม ${newParticipants.length} คนสำเร็จ`);
    setSelectedUserIds([]); setSelectedUsersPos({}); setParticipantSearch("");
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

  // ส่งออกเป็นหลักฐาน — ชื่อแขกพิมพ์เองได้ จึงกันสูตร Excel (=, +, -, @) ด้วยการเติม ' นำหน้า
  const exportAcksCsv = () => {
    const cell = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
    const rows = (meeting.confidentialityAcks ?? []).map((a) =>
      [a.name, a.userId.startsWith("guest-") ? "ภายนอก" : "ในระบบ", new Date(a.at).toLocaleString("th-TH")].map(cell).join(",")
    );
    // BOM ให้ Excel อ่านภาษาไทยถูก
    const csv = "﻿" + [["ชื่อ", "ประเภท", "เวลาที่ยอมรับ"].map(cell).join(","), ...rows].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `confidentiality-${meeting.id}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  // ลบได้ = ผู้จัด/ผู้จัดการประชุม/admin (ตรงกับ backend canEditMeeting) โดยไม่ผูกกับสถานะ
  const canDelete = can(currentUser, "meeting.edit", meeting);
  const canManageParticipants = can(currentUser, "meeting.manageParticipants", meeting) && meeting.status !== "endorsed";
  const canManagePermissions = can(currentUser, "meeting.managePermissions", meeting) && meeting.status !== "endorsed";
  const canNotify = can(currentUser, "meeting.notify", meeting);
  const canChangeStatus = can(currentUser, "meeting.changeStatus", meeting) && meeting.status !== "endorsed";
  const canEndorse = can(currentUser, "meeting.endorse", meeting);
  const noPermissionReason = denialReason(currentUser, "meeting.edit", meeting);

  return (
    <div className="p-4 md:p-6 pb-16 max-w-wide mx-auto">
      {/* Header */}
      <div className="mb-4">
        <Link href="/meetings" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
          <span className={iconSm}>arrow_back</span> กลับสู่รายการการประชุม
        </Link>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge className={`${meetingStatusColors[meeting.status]} text-caption border`}>{meetingStatusLabels[meeting.status]}</Badge>
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
              <Button asChild size="sm" className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium border-none shadow-md animate-pulse motion-reduce:animate-none">
                <Link href={`/live/${meeting.id}`}>
                  <span className="material-symbols-outlined text-base mr-1.5">video_call</span>
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
              <Badge variant="secondary" className="text-tiny h-8 px-3">
                <span className="material-symbols-outlined text-sm mr-1 text-success">check_circle</span>
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
                  toast.info("ประชุมจบแล้ว", { description: "สร้างร่างรายงานสรุปได้ที่แท็บ 'ไฟล์เอกสาร'" });
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
                <DropdownMenuItem
                  disabled={!canDelete}
                  onClick={() => setDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <span className={iconSm}>delete</span> ลบการประชุม
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบการประชุม</DialogTitle>
            <DialogDescription>
              ลบ &ldquo;{meeting.name}&rdquo; ออกถาวร — วาระ ไฟล์เอกสาร ผู้เข้าร่วม ผลโหวต และคำเชิญทั้งหมดจะหายไปด้วย กู้คืนไม่ได้
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)} disabled={deleting}>ยกเลิก</Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await removeMeeting(meeting.id);
                  toast.success("ลบการประชุมแล้ว");
                  router.push("/meetings");
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : "ลบการประชุมไม่สำเร็จ");
                  setDeleting(false);
                  setDeleteDialog(false);
                }
              }}
            >
              {deleting ? "กำลังลบ..." : "ลบถาวร"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* บอกเหตุผลเมื่อดูได้แต่แก้ไม่ได้ — ไม่งั้นผู้ใช้เห็นหน้าที่ปุ่มหายไปเฉยๆ โดยไม่รู้ว่าทำไม */}
      {!canEdit && (
        <Card className="card-shadow mb-4 border-warning/30 bg-warning/10">
          <CardContent className="p-3 flex items-start gap-2">
            <span className="material-symbols-outlined text-lg text-warning shrink-0">visibility</span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-warning">กำลังดูในโหมดอ่านอย่างเดียว</p>
              <p className="text-caption text-warning mt-0.5">{noPermissionReason}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status stepper */}
      <Card className="card-shadow mb-4">
        <CardContent className="p-4">
          <p className="sm:hidden text-tiny text-muted-foreground mb-1">เลื่อนซ้าย-ขวาเพื่อดูทุกขั้นตอน</p>
          <div className="flex items-center justify-between gap-2 overflow-x-auto snap-x">
            {statusOrder.map((s, i) => {
              const currentIdx = statusOrder.indexOf(meeting.status);
              const done = i < currentIdx;
              const active = i === currentIdx;
              return (
                <div key={s} className="flex items-center gap-2 flex-shrink-0">
                  <div className={`flex flex-col items-center gap-1 min-w-30 ${active ? "" : done ? "opacity-80" : "opacity-40"}`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      done ? "bg-primary text-primary-foreground" : active ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground"
                    }`}>
                      {done ? <span className={iconSm}>check</span> : i + 1}
                    </div>
                    <span className={`text-caption font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
                      {meetingStatusLabels[s].replace(/^\d+\.\s*/, "")}
                    </span>
                  </div>
                  {i < statusOrder.length - 1 && (
                    <div className={`h-0.5 w-8 md:w-12 ${done ? "bg-primary" : "bg-muted"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList>
          <TabsTrigger value="agenda"><span className={iconSm}>list_alt</span> วาระการประชุม</TabsTrigger>
          <TabsTrigger value="participants"><span className={iconSm}>groups</span> องค์ประชุม</TabsTrigger>
          <TabsTrigger value="files"><span className={iconSm}>folder</span> ไฟล์เอกสาร</TabsTrigger>
          <TabsTrigger value="permissions"><span className={iconSm}>admin_panel_settings</span> สิทธิ์</TabsTrigger>
          <TabsTrigger value="info"><span className={iconSm}>info</span> ข้อมูลการประชุม</TabsTrigger>
        </TabsList>
        </div>

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
                <div key={a.id} className={`rounded-lg border p-3 ${a.no.includes(".") ? "pl-6" : "pl-3"}`}>
                  <div className="flex items-start gap-2">
                    <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${a.no.includes(".") ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>{a.no}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{a.title}</p>
                        {a.secretGroupId && <Badge variant="secondary" className="text-tiny"><span className={iconSm}>lock</span>วาระลับ</Badge>}
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
                              <p className="text-caption text-muted-foreground">{p.role} {!p.inSystem && <span className="text-warning">· ภายนอก</span>}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-xs">
                          <Badge variant={p.position === "ประธาน" ? "default" : "secondary"} className="text-tiny">{p.position}</Badge>
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

          {/* ผู้ยอมรับข้อตกลงรักษาความลับ — server ส่ง confidentialityAcks มาเฉพาะผู้จัด */}
          {canEdit && (
            <Card className="card-shadow">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm">ผู้ยอมรับข้อตกลงรักษาความลับ ({meeting.confidentialityAcks?.length ?? 0})</CardTitle>
                  <CardDescription className="text-xs">บันทึกทุกครั้งที่กดยอมรับก่อนเข้าห้องประชุม รวมบุคคลภายนอก</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void reload()}>
                    <span className={iconSm}>refresh</span> โหลดใหม่
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportAcksCsv} disabled={!meeting.confidentialityAcks?.length}>
                    <span className={iconSm}>download</span> CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {meeting.confidentialityAcks?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="text-left py-2 px-2">ชื่อ</th>
                          <th className="text-left py-2 px-2">ประเภท</th>
                          <th className="text-left py-2 px-2">เวลาที่ยอมรับ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...meeting.confidentialityAcks].reverse().map((a) => (
                          <tr key={`${a.userId}-${a.at}`} className="border-b last:border-b-0">
                            <td className="py-2 px-2 font-medium">{a.name}</td>
                            <td className="py-2 px-2 text-xs">
                              {a.userId.startsWith("guest-") ? <span className="text-warning">ภายนอก</span> : "ในระบบ"}
                            </td>
                            <td className="py-2 px-2 text-xs text-muted-foreground">{new Date(a.at).toLocaleString("th-TH")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">ยังไม่มีผู้กดยอมรับ</p>
                )}
              </CardContent>
            </Card>
          )}
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
                      <span className="material-symbols-outlined text-muted-foreground text-lg">visibility_off</span>
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
                        <p className="text-caption text-muted-foreground mt-0.5">
                          {f.uploadedBy} · {f.uploadedAt} · {f.size}
                        </p>
                      </div>
                      <div className="hidden md:flex flex-col items-end gap-1">
                        <Badge className={`text-tiny border ${fileVisibilityColors[f.visibility]}`} variant="secondary">
                          <span className="material-symbols-outlined text-xs mr-0.5">{fileVisibilityIcons[f.visibility]}</span>
                          {fileVisibilityLabels[f.visibility]}
                        </Badge>
                        <Badge variant="secondary" className="text-tiny">
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
                {/* Generate summary */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-muted-foreground">summarize</span>
                    <div>
                      <p className="text-xs font-medium">ร่างรายงานสรุป</p>
                      <p className="text-caption text-muted-foreground">
                        {meeting.summaryDraftId ? "สร้างแล้ว — ดูได้ที่รายการเอกสาร" : "สรุปจากคำบรรยายสดที่บันทึกไว้ระหว่างประชุม"}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={summaryBusy || meeting.status === "in_progress"}
                    onClick={generateSummary}
                    title={meeting.status === "in_progress" ? "ต้องปิดประชุมก่อน" : undefined}
                  >
                    {summaryBusy
                      ? <><span className="material-symbols-outlined animate-spin text-sm mr-1">progress_activity</span>กำลังสร้าง...</>
                      : "สร้างร่างรายงาน"}
                  </Button>
                </div>

                <p className="text-caption text-muted-foreground flex items-center gap-1">
                  <span className="material-symbols-outlined text-compact">info</span>
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
                        <span className={iconSm + " text-warning"}>lock</span>
                        <p className="text-sm font-semibold">{g.name}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {g.participantIds.map(pid => {
                          const p = meeting.participants.find(x => x.id === pid);
                          return p ? <Badge key={pid} variant="secondary" className="text-tiny">{p.name}</Badge> : null;
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
                  <p className="text-xs text-muted-foreground">ใช้เมื่อเปิดบริการส่งอีเมล — ขณะนี้ระบบยังไม่ส่งอีเมลอัตโนมัติ</p>
                </div>
                <div className="md:col-span-2 rounded-lg border p-3 bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium mb-0.5">เปิดให้บุคคลภายนอกเข้าห้องประชุมเองได้</p>
                      <p className="text-caption text-muted-foreground">
                        เปิดเมื่อมีวิทยากรหรือผู้ทรงคุณวุฒิภายนอกที่ไม่มีบัญชีในระบบ —
                        ผู้ที่ได้รับลิงก์เชิญจะกรอกชื่อแล้วเข้าห้องได้เลย
                        {!meeting.allowGuestJoin && " ขณะนี้ปิดอยู่ เข้าได้เฉพาะองค์ประชุม — ลิงก์เชิญที่ออกไปแล้วจะใช้ไม่ได้จนกว่าจะเปิดอีกครั้ง"}
                      </p>
                    </div>
                    <Switch
                      checked={!!meeting.allowGuestJoin}
                      disabled={!canEdit}
                      onCheckedChange={async (v) => {
                        if (await updateMeeting(meeting.id, { allowGuestJoin: v })) {
                          toast.success(v ? "เปิดให้บุคคลภายนอกเข้าร่วมได้แล้ว" : "ปิดรับบุคคลภายนอกแล้ว");
                        }
                      }}
                    />
                  </div>
                </div>

                {/* ─── ลิงก์เชิญบุคคลภายนอก — ลิงก์เดียวต่อการประชุม ─── */}
                {meeting.allowGuestJoin && canEdit && (
                  <div className="md:col-span-2 rounded-lg border p-3 bg-primary/5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg text-primary">link</span>
                      <p className="text-xs font-semibold">ลิงก์เชิญบุคคลภายนอก</p>
                    </div>

                    {!guestLinkLoaded ? (
                      <p role="status" className="text-caption text-muted-foreground">กำลังโหลดลิงก์เชิญ...</p>
                    ) : guestLink ? (
                      <div className="space-y-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <code className="min-w-0 flex-1 break-all rounded-md border bg-background px-2.5 py-2 text-caption">
                            {guestLinkUrl(guestLink)}
                          </code>
                          <Button size="sm" onClick={() => void handleCopyLink(guestLink)} className="shrink-0">
                            <span className="material-symbols-outlined text-base mr-1">{copied ? "check" : "content_copy"}</span>
                            {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleRotateGuestLink()}
                          disabled={guestLinkBusy}
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        >
                          <span className="material-symbols-outlined text-base mr-1">autorenew</span>
                          {guestLinkBusy ? "กำลังสร้าง..." : "สร้างลิงก์ใหม่ (ยกเลิกลิงก์เดิม)"}
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" onClick={() => void handleRotateGuestLink()} disabled={guestLinkBusy}>
                        <span className="material-symbols-outlined text-base mr-1">add_link</span>
                        {guestLinkBusy ? "กำลังสร้าง..." : "สร้างลิงก์เชิญ"}
                      </Button>
                    )}

                    <p className="text-tiny text-muted-foreground">
                      ส่งลิงก์นี้ให้วิทยากรหรือผู้สังเกตการณ์ทุกคนได้ — ผู้ที่ได้ลิงก์ใส่ชื่อแล้วเข้าห้องประชุมได้ทันทีโดยไม่ต้องมีบัญชี ·
                      ปิด &quot;รับบุคคลภายนอก&quot; เมื่อไรลิงก์ใช้ไม่ได้ทันที · ระบบยังไม่ส่งอีเมลให้อัตโนมัติ
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground mb-1">การเก็บบันทึกลง Drive</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${meeting.savedToDrive ? "bg-success" : "bg-muted-foreground"}`} />
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
                        <Badge key={b.id} variant="secondary" className="text-tiny">{b.name}</Badge>
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
        <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col">
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
                  <span className="material-symbols-outlined text-sm">group</span>
                  ผู้ใช้ในระบบ ({systemParticipants.length} คน)
                </label>
                <div className="rounded-md border p-2 bg-muted/30 max-h-28 overflow-y-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {systemParticipants.map(p => (
                      <Badge key={p.id} variant="secondary" className="text-caption gap-1">
                        <span className="material-symbols-outlined text-xs">person</span>
                        {p.name}
                        <span className="text-muted-foreground">({p.email})</span>
                      </Badge>
                    ))}
                  </div>
                </div>
                <p className="text-caption text-muted-foreground mt-1">ระบบดึงอีเมลจากข้อมูลผู้ใช้อัตโนมัติ + แสดงแจ้งเตือนในหน้าพอร์ทัลของแต่ละคน</p>
              </div>

              {/* ผู้รับ — บุคคลภายนอก */}
              {externalParticipants.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">person_add</span>
                    บุคคลภายนอก ({externalParticipants.length} คน) — ส่งลิงก์เชิญเอง
                  </label>
                  <div className="rounded-md border p-2 bg-warning/10  max-h-28 overflow-y-auto">
                    <div className="flex flex-wrap gap-1.5">
                      {externalParticipants.map(p => (
                        <Badge key={p.id} variant="outline" className="text-caption gap-1 border-warning/30 text-warning ">
                          <span className="material-symbols-outlined text-xs">link</span>
                          {p.name}
                          {p.email !== "-" && <span className="text-muted-foreground">({p.email})</span>}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="text-caption text-warning mt-1">ส่งลิงก์เชิญจากส่วน &quot;ข้อมูลการประชุม&quot; ให้บุคคลภายนอก — ใส่ชื่อแล้วเข้าห้องได้โดยไม่ต้องมีบัญชี</p>
                </div>
              )}

              {/* สิ่งที่จะส่ง */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">สิ่งที่จะส่งในอีเมล</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/20">
                    <span className="material-symbols-outlined text-lg text-primary">description</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">รายละเอียดวาระการประชุม</p>
                      <p className="text-caption text-muted-foreground">{meeting.agenda.length} วาระ · {meeting.date} · {meeting.startTime}-{meeting.endTime} · {meeting.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/20">
                    <span className="material-symbols-outlined text-lg text-info">calendar_add_on</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">ไฟล์ปฏิทิน (.ics)</p>
                      <p className="text-caption text-muted-foreground">ผู้รับกดเพิ่มลง Google Calendar / Outlook ได้ทันที · มี alarm แจ้ง 1 วันก่อน + 30 นาทีก่อน</p>
                    </div>
                    <Button variant="outline" size="sm" className="text-caption h-7" onClick={() => downloadIcs(meeting)}>
                      <span className="material-symbols-outlined text-sm mr-1">download</span>ทดลองดาวน์โหลด
                    </Button>
                  </div>
                  {meeting.conferenceLink && (
                    <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/20">
                      <span className="material-symbols-outlined text-lg text-success">video_call</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium">ลิงก์ประชุมออนไลน์</p>
                        <p className="text-caption text-muted-foreground break-all">{meeting.conferenceLink}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Reminder */}
              <div className="rounded-lg border border-dashed border-info/30 bg-info/10  px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-lg text-info mt-0.5">notifications_active</span>
                  <div>
                    <p className="text-sm font-medium text-info ">Reminder อัตโนมัติ</p>
                    <p className="text-caption text-info/80 ">
                      ระบบจะส่งอีเมลเตือนพร้อมลิงก์เข้าประชุม <strong>1 วันก่อนวันประชุม</strong> อัตโนมัติ
                      {meeting.reminderSentAt && (
                        <span className="ml-1 text-success">✓ ส่งแล้วเมื่อ {new Date(meeting.reminderSentAt).toLocaleString("th-TH")}</span>
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
              <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
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
                    <Badge variant="secondary" className="text-tiny gap-1">
                      <span className="material-symbols-outlined text-xs">event</span>
                      {meeting.shortName}.ics
                    </Badge>
                  </div>
                </div>

                {/* Email Body */}
                <div className="px-4 py-4 text-sm space-y-3">
                  <p>เรียน ผู้เข้าร่วมประชุมทุกท่าน</p>
                  <p>ขอเรียนเชิญเข้าร่วม<strong>{meeting.name}</strong></p>

                  <div className="rounded-md border px-3 py-2.5 bg-muted/20 space-y-1 text-compact">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-muted-foreground">calendar_today</span>
                      <span>วันที่: <strong>{meeting.date}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-muted-foreground">schedule</span>
                      <span>เวลา: <strong>{meeting.startTime} - {meeting.endTime} น.</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-muted-foreground">place</span>
                      <span>สถานที่: <strong>{meeting.location}</strong></span>
                    </div>
                    {meeting.conferenceLink && (
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-muted-foreground">video_call</span>
                        <span>ประชุมออนไลน์: <span className="text-info underline">{meeting.conferenceLink.slice(0, 50)}…</span></span>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="font-medium mb-1.5">วาระการประชุม:</p>
                    <ol className="list-none space-y-1 text-compact">
                      {meeting.agenda.map(a => (
                        <li key={a.id} className="flex items-start gap-2">
                          <Badge variant="outline" className="text-tiny mt-0.5 flex-shrink-0">{a.no}</Badge>
                          <span>{a.title}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="rounded-md border border-info/30 bg-info/10  px-3 py-2 text-xs text-info ">
                    <span className="material-symbols-outlined text-sm align-middle mr-1">calendar_add_on</span>
                    กดไฟล์แนบ <strong>{meeting.shortName}.ics</strong> เพื่อเพิ่มกิจกรรมลงปฏิทินของท่านอัตโนมัติ
                  </div>

                  <hr />
                  <p className="text-caption text-muted-foreground">
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
            <DialogDescription className="text-warning">
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
                <span className="material-symbols-outlined text-base">group</span>
                ผู้ใช้ในระบบ
              </TabsTrigger>
              <TabsTrigger value="external" className="flex-1 gap-1">
                <span className="material-symbols-outlined text-base">person_add</span>
                บุคคลภายนอก
              </TabsTrigger>
            </TabsList>

            <TabsContent value="system" className="mt-3 space-y-3">
              <div className="relative">
                <span className="material-symbols-outlined text-lg text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2">search</span>
                <Input
                  value={participantSearch}
                  onChange={e => setParticipantSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ ตำแหน่ง หน่วยงาน..."
                  className="pl-9"
                />
              </div>

              <div className="border rounded-lg max-h-70 overflow-y-auto">
                {filteredUsers.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    <span className="material-symbols-outlined text-3xl block mb-1">person_off</span>
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
                          {selected && <span className="material-symbols-outlined text-sm text-primary-foreground">check</span>}
                        </div>
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-primary text-xs font-semibold">{u.name.charAt(u.name.indexOf(" ") + 1)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <p className="text-caption text-muted-foreground truncate">{u.position} · {u.department}</p>
                        </div>
                        {selected && (
                          <select
                            className="border rounded px-1.5 py-0.5 text-caption bg-transparent flex-shrink-0"
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
                  <span className="material-symbols-outlined text-base mr-1">group_add</span>
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
                  <span className="material-symbols-outlined text-base mr-1">person_add</span>
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
              <span className="material-symbols-outlined text-primary text-4xl mb-2">cloud_upload</span>
              {pendingFile ? (
                <>
                  <p className="text-sm font-medium break-all">{pendingFile.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatBytes(pendingFile.size)}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">เลือกไฟล์จากเครื่อง</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF และรูปภาพเปิดอ่านในเว็บได้ · DOCX/XLSX แนบได้แต่ต้องเปิดในโปรแกรม · ไม่เกิน 20 MB</p>
                </>
              )}
              {/* ไฟล์อัปโหลดขึ้น server ตอนกด "บันทึก" */}
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
                }}
              />
              <Button
                size="sm"
                variant="outline"
                type="button"
                className="mt-3"
                onClick={() => filePickerRef.current?.click()}
              >
                {pendingFile ? "เปลี่ยนไฟล์" : "เลือกไฟล์"}
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
            <Button onClick={async () => { setEmailSenderOpen(false); if (await updateMeeting(meeting.id, { emailSenderName: emailSender })) toast.success("บันทึกเรียบร้อย"); }}>บันทึก</Button>
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
                    <p className="text-caption text-muted-foreground">อ่านวาระและเอกสารได้</p>
                  </div>
                </label>
                <label className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${permType === "manager" ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}>
                  <input type="radio" checked={permType === "manager"} onChange={() => setPermType("manager")} className="accent-primary" />
                  <div>
                    <p className="text-sm font-medium">สิทธิ์ผู้จัดประชุม</p>
                    <p className="text-caption text-muted-foreground">จัดการการประชุมได้ทั้งหมด</p>
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
          viewerName={currentUser.name}
          confidentialityLevel={meeting.confidentialityLevel ?? "normal"}
        />
      )}

    </div>
  );
}
