"use client";

import { useState, use } from "react";
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
import { meetingStatusLabels, meetingStatusColors, displayFormats, MeetingStatus, Meeting, canViewFile, fileVisibilityLabels, fileVisibilityColors, fileVisibilityIcons, users } from "@/data";
import { ComingSoon, ComingSoonBadge } from "@/components/ui/ComingSoon";
import { can, canEditMeeting, denialReason } from "@/lib/authz";
import { useCurrentUser } from "@/context/UserContext";
import { useMeetings } from "@/context/MeetingContext";

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

  const changeStatus = (s: MeetingStatus) => {
    updateMeeting(meeting.id, { status: s });
    toast.success(`เปลี่ยนสถานะเป็น: ${meetingStatusLabels[s]}`);
  };

  const notifyAgenda = () => {
    updateMeeting(meeting.id, { status: "notified" });
    setNotifyDialog(false);
    toast.success("ส่ง Email แจ้งวาระเรียบร้อย", { description: `แจ้งไปยัง ${meeting.participants.length} ราย` });
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

  const addParticipant = (inSystem: boolean) => {
    if (!participantName.trim()) { toast.error("กรุณากรอกชื่อ"); return; }
    // ถ้าเป็นคนในระบบ ผูกกับบัญชีจริงเพื่อให้สิทธิ์ทำงานถูกต้อง
    const matched = inSystem
      ? users.find((u) => u.name === participantName.trim())
      : undefined;
    updateMeeting(meeting.id, {
      participants: [...meeting.participants, {
        id: `P-${Date.now()}`,
        userId: matched?.id ?? null,
        name: participantName,
        position: participantPos,
        role: matched?.position ?? (inSystem ? "ผู้ใช้ในระบบ" : "ผู้ทรงคุณวุฒิภายนอก"),
        department: matched?.department ?? (inSystem ? "-" : "ภายนอก"),
        email: matched?.email ?? "-",
        attendance: "pending",
        inSystem,
      }]
    });
    toast.success("เพิ่มองค์ประชุมสำเร็จ");
    setParticipantName(""); setParticipantPos("กรรมการ");
    setAddParticipantOpen(false);
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
            {meeting.status === "notified" && canChangeStatus && (
              <Button size="sm" onClick={() => setOpenTimeDialog(true)}><span className={iconSm}>play_circle</span>เปิดประชุม</Button>
            )}
            {meeting.status === "in_progress" && canChangeStatus && (
              <Button size="sm" onClick={closeMeeting}><span className={iconSm}>stop_circle</span>ปิดประชุม</Button>
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
                {/* การสร้างไฟล์เอกสารจริงต้องใช้ backend — ยังไม่เปิดใช้งาน */}
                <DropdownMenuItem disabled title="ยังไม่เปิดใช้งาน — รอเชื่อมต่อระบบสร้างเอกสาร">
                  <span className={iconSm}>description</span> ร่างรายงาน (Word)
                </DropdownMenuItem>
                <DropdownMenuItem disabled title="ยังไม่เปิดใช้งาน — รอเชื่อมต่อระบบสร้างเอกสาร">
                  <span className={iconSm}>picture_as_pdf</span> พิมพ์รายงาน (PDF)
                </DropdownMenuItem>
                <DropdownMenuItem disabled title="ยังไม่เปิดใช้งาน — รอเชื่อมต่อระบบสร้างเอกสาร">
                  <span className={iconSm}>table_chart</span> พิมพ์รายงาน (Excel)
                </DropdownMenuItem>
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
                      <Button size="icon-sm" variant="ghost" disabled title="ยังไม่เปิดใช้งาน — รอระบบจัดเก็บไฟล์ (จะเปิดใช้เมื่ออัปโหลดไฟล์จริงได้)">
                        <span className={iconSm}>download</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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

        </TabsContent>
      </Tabs>

      {/* Notify Dialog */}
      <Dialog open={notifyDialog} onOpenChange={setNotifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แจ้งวาระการประชุม</DialogTitle>
            <DialogDescription>ส่ง Email รายละเอียดการประชุมไปยังองค์ประชุมทั้งหมด</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ผู้รับ ({meeting.participants.length} คน)</label>
              <div className="rounded-md border p-2 bg-muted/30 max-h-32 overflow-y-auto text-xs">
                {meeting.participants.map(p => p.name).join(", ")}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">CC</label>
              <Input placeholder="อีเมล CC เพิ่มเติม (คั่นด้วย ,)" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">หัวข้อ</label>
              <Input defaultValue={`แจ้งวาระ: ${meeting.name}`} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifyDialog(false)}>ยกเลิก</Button>
            <Button onClick={notifyAgenda}><span className={iconSm}>send</span>ส่ง Email</Button>
          </DialogFooter>
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
      <Dialog open={addParticipantOpen} onOpenChange={setAddParticipantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มองค์ประชุม</DialogTitle>
            <DialogDescription>เลือกจากผู้ใช้ในระบบ หรือเพิ่มบุคคลภายนอก</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddParticipantOpen(false)}>ยกเลิก</Button>
            <Button variant="outline" onClick={() => addParticipant(false)}>เพิ่มบุคคลภายนอก</Button>
            <Button onClick={() => addParticipant(true)}>เพิ่มจากผู้ใช้ในระบบ</Button>
          </DialogFooter>
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
              <p className="text-sm font-medium">คลิก &quot;เลือกไฟล์&quot; หรือลากไฟล์มาที่นี่</p>
              <p className="text-xs text-muted-foreground mt-1">รองรับ PDF, DOCX, XLSX (สูงสุด 20 MB)</p>
              <Button size="sm" variant="outline" className="mt-3">เลือกไฟล์</Button>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">คำอธิบายไฟล์</label>
              <Input placeholder="อธิบายไฟล์นี้..." value={fileDesc} onChange={e => setFileDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFileOpen(false)}>ยกเลิก</Button>
            <Button onClick={() => {
              const newFile = {
                id: `F-${Date.now()}`,
                name: "เอกสารเพิ่มเติม_" + Date.now().toString().slice(-4) + ".pdf",
                description: fileDesc.trim() || "เอกสารอัปโหลดเพิ่มเติม",
                size: "450 KB",
                uploadedAt: new Date().toISOString().split('T')[0],
                uploadedBy: currentUser.name,
                type: "attachment" as const,
                visibility: "participants" as const,
              };
              addMeetingFile(meeting.id, newFile);
              setFileDesc("");
              setAddFileOpen(false);
              toast.success("อัปโหลดสำเร็จ");
            }}>บันทึก</Button>
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
    </div>
  );
}
