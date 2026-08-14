"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { committees, meetingRooms, users, Meeting, MeetingParticipant } from "@/data";
import { useMeetings } from "@/context/MeetingContext";
import { useCurrentUser } from "@/context/UserContext";
import { conferenceProviders, detectProvider, newConferenceRoomKey } from "@/lib/conference";

const meetingTypes = ["การประชุมคณะกรรมการ", "การประชุมคณะทำงาน", "การประชุมภายในทีม", "การประชุมวิสามัญ", "การประชุมสามัญประจำปี"];

export default function NewMeetingPage() {
  const router = useRouter();
  const { addMeeting } = useMeetings();
  const { currentUser } = useCurrentUser();
  const [form, setForm] = useState({
    name: "",
    shortName: "",
    type: "การประชุมคณะกรรมการ",
    committeeId: committees[0].id,
    organizer: "",
    date: "2026-07-25",
    startTime: "09:00",
    endTime: "12:00",
    roomId: meetingRooms[0].id,
    // "ห้องจำลอง (Mock)" ถูกตัดออกจากตัวเลือกแล้ว — resolveVideoSurface() ไม่มี simulated view
    // ให้ fallback อีกต่อไป เลือกอะไรก็ลง ZegoCloud จริงเหมือนกันหมด (ดู src/services/video/index.ts)
    conferenceEngine: "zegocloud" as "zegocloud" | "external",
    conferenceLink: "",
    description: "",
    confidentialityLevel: "normal" as "normal" | "restricted" | "top_secret",
    /** เชิญสมาชิกคณะทำงานเข้าเป็นองค์ประชุมอัตโนมัติ — ถ้าไม่เชิญ จะไม่มีใครเข้าห้องได้นอกจากผู้จัด */
    inviteCommitteeMembers: true,
    /** เปิดให้คนนอกที่ได้รับลิงก์เข้าเองได้ — จำเป็นตอนทดสอบหลายเครื่อง/หลายหน้าต่าง */
    allowGuestJoin: true,
  });

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(p => ({ ...p, [k]: v }));

  const externalProvider = detectProvider(form.conferenceLink);
  const provider = form.conferenceEngine === "external" ? externalProvider : "zegocloud" as const;
  const detectedSpec = conferenceProviders[provider];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("กรุณากรอกชื่อการประชุม"); return; }

    const committee = committees.find(c => c.id === form.committeeId)!;
    // ฟอร์มเก็บ roomId แต่ทุกหน้าที่แสดงผลคาดหวัง "ชื่อห้อง" — แปลงตรงนี้จุดเดียว
    const room = meetingRooms.find(r => r.id === form.roomId)!;

    // องค์ประชุมตั้งต้น: ผู้จัด + สมาชิกคณะทำงานที่เลือก
    // เดิมสร้างประชุมแล้วได้ participants ว่าง ทำให้ไม่มีใครเข้าห้องได้เลยนอกจากผู้จัด
    const invitedUsers = form.inviteCommitteeMembers
      ? users.filter(u => u.committeeIds.includes(committee.id) || u.id === currentUser.id)
      : users.filter(u => u.id === currentUser.id);

    const participants: MeetingParticipant[] = invitedUsers.map(u => ({
      id: `P-${u.id}`,
      userId: u.id,
      name: u.name,
      position:
        u.id === currentUser.id
          ? "ผู้จัดประชุม"
          : u.systemRole === "secretary"
          ? "เลขานุการ"
          : u.systemRole === "executive"
          ? "ประธาน"
          : "กรรมการ",
      role: u.position,
      department: u.department,
      email: u.email,
      attendance: "pending",
      present: false,
      inSystem: true,
    }));

    const newMeeting: Meeting = {
      id: `MT-${Date.now()}`,
      name: form.name.trim(),
      shortName: form.shortName.trim() || form.name.trim().slice(0, 20),
      type: form.type,
      committeeId: committee.id,
      committee: committee.name,
      organizerId: currentUser.id,
      organizer: form.organizer.trim() || currentUser.name,
      organizerEmail: currentUser.email,
      emailSenderName: currentUser.department,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      location: room.name,
      conferenceLink: form.conferenceEngine === "external" ? (form.conferenceLink.trim() || undefined) : undefined,
      conferenceProvider: provider,
      // กุญแจห้องสำหรับเครื่องยนต์ที่ฝังในเว็บ — เดาไม่ได้ สร้างตั้งแต่สร้างประชุม
      conferenceRoomKey: newConferenceRoomKey(),
      transcriptStatus: "none",
      description: form.description.trim() || undefined,
      confidentialityLevel: form.confidentialityLevel,
      status: "prepare",
      displayFormat: 2,
      participants,
      allowGuestJoin: form.allowGuestJoin,
      files: [],
      agenda: [],
      secretGroups: [],
      // ผู้สร้างเป็นผู้จัดการประชุมโดยอัตโนมัติ
      permissions: [{ userId: currentUser.id, name: currentUser.name, type: "manager" }],
      savedToDrive: false,
      createdAt: new Date().toISOString().split("T")[0],
    };

    addMeeting(newMeeting);
    toast.success("สร้างการประชุมสำเร็จ", { description: "ระบบจะนำท่านไปยังหน้ารายละเอียดเพื่อจัดการองค์ประชุม" });
    router.push(`/meetings/${newMeeting.id}`);
  };

  return (
    <div className="p-4 md:p-6 pb-16 max-w-[900px] mx-auto">
      <header className="mb-5">
        <h1 className="text-lg md:text-xl font-semibold mb-0.5">สร้างการประชุม</h1>
        <p className="text-xs text-muted-foreground">กรอกข้อมูลการประชุมและกำหนดผู้จัดการประชุม</p>
      </header>

      <form onSubmit={submit}>
        <Card className="card-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">ข้อมูลการประชุม</CardTitle>
            <CardDescription className="text-xs">ช่องที่มีเครื่องหมาย <span className="text-destructive">*</span> จำเป็นต้องกรอก</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ชื่อการประชุม<span className="text-destructive">*</span></label>
                <Input value={form.name} onChange={e => update("name", e.target.value)} placeholder="เช่น การประชุมคณะกรรมการบริหาร ครั้งที่ 8/2569" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ชื่อย่อ</label>
                <Input value={form.shortName} onChange={e => update("shortName", e.target.value)} placeholder="เช่น กก.บริหาร 8/69" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ประเภทการประชุม<span className="text-destructive">*</span></label>
                <Select value={form.type} onValueChange={v => update("type", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{meetingTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">คณะทำงาน<span className="text-destructive">*</span></label>
                <Select value={form.committeeId} onValueChange={v => update("committeeId", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{committees.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ผู้จัดการประชุม<span className="text-destructive">*</span></label>
                <Input value={form.organizer} onChange={e => update("organizer", e.target.value)} placeholder="ชื่อผู้จัด" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">วันที่ประชุม<span className="text-destructive">*</span></label>
                <Input type="date" value={form.date} onChange={e => update("date", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">เวลาเริ่ม<span className="text-destructive">*</span></label>
                <Input type="time" value={form.startTime} onChange={e => update("startTime", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">เวลาสิ้นสุด<span className="text-destructive">*</span></label>
                <Input type="time" value={form.endTime} onChange={e => update("endTime", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">สถานที่ประชุม<span className="text-destructive">*</span></label>
                <Select value={form.roomId} onValueChange={v => update("roomId", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{meetingRooms.map(r => <SelectItem key={r.id} value={r.id}>{r.name} — {r.location} {r.floor}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ระบบประชุมออนไลน์</label>
                <select
                  value={form.conferenceEngine}
                  onChange={e => update("conferenceEngine", e.target.value as typeof form.conferenceEngine)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="zegocloud">ZegoCloud (ประชุมในเว็บ)</option>
                  <option value="external">วางลิงก์ภายนอก (Teams / Zoom / Meet)</option>
                </select>
              </div>
              {form.conferenceEngine === "external" && (
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">ลิงก์ประชุมออนไลน์</label>
                  <Input
                    type="url"
                    value={form.conferenceLink}
                    onChange={e => update("conferenceLink", e.target.value)}
                    placeholder="วางลิงก์จาก Teams / Zoom / Google Meet ได้เลย"
                  />
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="material-symbols-outlined text-[16px] text-muted-foreground">
                      {detectedSpec.icon}
                    </span>
                    <span className="text-muted-foreground">ระบบตรวจพบ:</span>
                    <span className="font-medium">{detectedSpec.label}</span>
                    {detectedSpec.launchMode === "external" && (
                      <span className="text-muted-foreground">— ผู้เข้าร่วมจะกดเปิดแอปจากหน้าประชุม</span>
                    )}
                  </div>
                </div>
              )}
              {form.conferenceEngine === "zegocloud" && (
                <div className="md:col-span-2">
                  <div className="rounded-lg bg-[#0055FF]/5 border border-[#0055FF]/20 px-3 py-2 flex items-center gap-2 text-xs">
                    <span className="material-symbols-outlined text-[16px] text-[#0055FF]">videocam</span>
                    <span className="text-muted-foreground">ผู้เข้าร่วมจะประชุมผ่าน ZegoCloud ในหน้าเว็บนี้โดยตรง ไม่ต้องติดตั้งแอป (ต้องอนุญาตให้ใช้ไมค์)</span>
                  </div>
                </div>
              )}
              <div className="md:col-span-2 space-y-2">
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.inviteCommitteeMembers}
                    onChange={e => update("inviteCommitteeMembers", e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">เชิญสมาชิกคณะทำงานเป็นองค์ประชุมอัตโนมัติ</span>
                    <span className="block text-muted-foreground">
                      ผู้ใช้ในคณะที่เลือกจะเข้าห้องประชุมได้ทันที — ถ้าไม่ติ๊ก จะมีแค่ผู้จัดที่เข้าได้
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allowGuestJoin}
                    onChange={e => update("allowGuestJoin", e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">อนุญาตให้บุคคลภายนอกที่มีลิงก์เข้าร่วมเอง</span>
                    <span className="block text-muted-foreground">
                      ใช้ตอนทดสอบหลายเครื่อง/หลายหน้าต่าง หรือมีวิทยากรที่ไม่มีบัญชีในระบบ
                    </span>
                  </span>
                </label>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ชั้นความลับ</label>
                <select
                  value={form.confidentialityLevel}
                  onChange={e => update("confidentialityLevel", e.target.value as typeof form.confidentialityLevel)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="normal">ทั่วไป</option>
                  <option value="restricted">ลับ — watermark เข้ม, แถบเตือนสีส้ม</option>
                  <option value="top_secret">ลับมาก — watermark refresh 5 วิ, ปิด copy</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">รายละเอียดเพิ่มเติม</label>
                <Textarea value={form.description} onChange={e => update("description", e.target.value)} placeholder="วัตถุประสงค์การประชุม, หมายเหตุ..." />
              </div>
            </div>

            <div className="rounded-lg border-2 border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground mb-2">หลังจากบันทึก คุณสามารถ:</p>
              <div className="flex flex-wrap justify-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-muted">จัดการองค์ประชุม</span>
                <span className="px-2 py-0.5 rounded bg-muted">เพิ่มระเบียบวาระ</span>
                <span className="px-2 py-0.5 rounded bg-muted">แนบไฟล์ระเบียบ/คำสั่ง</span>
                <span className="px-2 py-0.5 rounded bg-muted">กำหนดกลุ่มชั้นความลับ</span>
                <span className="px-2 py-0.5 rounded bg-muted">เพิ่มสิทธิ์ผู้ใช้งาน</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/meetings")}>ยกเลิก</Button>
          <Button type="submit">บันทึกการประชุม</Button>
        </div>
      </form>
    </div>
  );
}
