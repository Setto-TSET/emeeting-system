"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMeetings } from "@/context/MeetingContext";
import { useCurrentUser } from "@/context/UserContext";
import { DocumentLightbox } from "@/components/meeting/DocumentPreview";
import { meetingStatusLabels, meetingStatusColors, canViewFile, isMyMeeting, Meeting, MeetingFile } from "@/data";
import { downloadIcs } from "@/lib/calendar";
import { PageError, PageLoading } from "@/components/layout/PageState";

export default function MyMeetingsPage() {
  const router = useRouter();
  const { meetings, loading: meetingsLoading, error: meetingsError, reload: reloadMeetings } = useMeetings();
  const { currentUser } = useCurrentUser();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // เอกสารเปิดอ่านในเว็บ — ไม่มีดาวน์โหลด
  const [viewingFile, setViewingFile] = useState<MeetingFile | null>(null);
  const [viewingMeeting, setViewingMeeting] = useState<Meeting | null>(null);

  const openPreview = (file: MeetingFile, meeting: Meeting) => {
    setViewingFile(file);
    setViewingMeeting(meeting);
  };

  // แสดงเฉพาะการประชุมที่ผู้ใช้เกี่ยวข้องเท่านั้น
  const myMeetings = meetings.filter((m) => isMyMeeting(currentUser, m));

  // ที่กำลังประชุมอยู่ขึ้นก่อนเสมอ
  const sortedMeetings = [...myMeetings].sort((a, b) => {
    if (a.status === "in_progress" && b.status !== "in_progress") return -1;
    if (b.status === "in_progress" && a.status !== "in_progress") return 1;
    return a.date.localeCompare(b.date);
  });

  const canJoin = (m: Meeting) =>
    m.status === "in_progress" || m.status === "notified" || m.status === "waiting_endorse";

  // ระหว่างโหลดหรือโหลดไม่สำเร็จ ห้ามแสดงสถานะว่าง — ผู้ใช้จะเข้าใจว่าไม่มีการประชุม
  if (meetingsLoading && meetings.length === 0) return <PageLoading />;
  if (meetingsError && meetings.length === 0) return <PageError message={meetingsError} onRetry={() => void reloadMeetings()} />;

  return (
    <div className="p-4 md:p-6 pb-16 max-w-narrow mx-auto">
      <header className="mb-5">
        <h1 className="text-lg md:text-xl font-semibold mb-0.5">การประชุมของฉัน</h1>
        <p className="text-xs text-muted-foreground">
          การประชุมที่คุณเป็นองค์ประชุม พร้อมวาระและเอกสารประกอบ
        </p>
      </header>

      <div className="space-y-3">
        {sortedMeetings.map((m) => {
          const isExpanded = expandedId === m.id;
          const isLive = m.status === "in_progress";
          const joinable = canJoin(m);
          const visibleFiles = m.files.filter((f) => canViewFile(f, currentUser, m));

          return (
            <Card key={m.id} className={`card-shadow ${isLive ? "border-primary/60" : ""}`}>
              <CardContent className="p-0">
                {/* แถวหลัก — กดเพื่อกางรายละเอียด */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  className="w-full text-left p-4 flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer"
                >
                  <div className="flex-shrink-0 flex sm:flex-col items-center justify-center gap-2 sm:gap-0 rounded-lg bg-muted border p-3 w-full sm:w-17 text-center">
                    <span className="text-primary text-2xl font-bold leading-none">
                      {new Date(m.date).getDate()}
                    </span>
                    <span className="text-tiny text-muted-foreground">
                      {new Date(m.date).toLocaleDateString("th-TH", { month: "short" })}{" "}
                      {new Date(m.date).getFullYear() + 543}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <Badge className={`${meetingStatusColors[m.status]} border text-tiny font-semibold py-0.5`}>
                        {meetingStatusLabels[m.status]}
                      </Badge>
                      {isLive && (
                        <span className="flex items-center gap-1 text-tiny font-bold text-destructive">
                          <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
                          </span>
                          กำลังประชุมอยู่
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-semibold">{m.name}</h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        {m.startTime} - {m.endTime} น.
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">place</span>
                        {m.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">description</span>
                        เอกสาร {visibleFiles.length} ฉบับ
                      </span>
                    </div>
                  </div>

                  <span className="material-symbols-outlined text-muted-foreground shrink-0 hidden sm:block">
                    {isExpanded ? "expand_less" : "expand_more"}
                  </span>
                </button>

                {/* แจ้งเตือน + ปฏิทิน */}
                {m.notifiedAt && (
                  <div className="px-4 pb-2">
                    <div className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-caption text-info min-w-0">
                        <span className="material-symbols-outlined text-base">notifications</span>
                        <span>แจ้งวาระเมื่อ {new Date(m.notifiedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-caption gap-1 border-info/40 text-info hover:bg-info/15"
                        onClick={() => downloadIcs(m)}
                      >
                        <span className="material-symbols-outlined text-sm">calendar_add_on</span>
                        เพิ่มลงปฏิทิน
                      </Button>
                    </div>
                  </div>
                )}

                {/* ปุ่มเข้าประชุม */}
                <div className="px-4 pb-4">
                  {joinable ? (
                    <Button
                      onClick={() => router.push(`/live/${m.id}`)}
                      className="w-full h-11 font-semibold"
                    >
                      <span className="material-symbols-outlined text-xl mr-1.5">video_call</span>
                      เข้าห้องประชุม
                    </Button>
                  ) : (
                    <div className="w-full h-11 rounded-lg border bg-muted/50 flex items-center justify-center text-xs text-muted-foreground gap-1.5">
                      <span className="material-symbols-outlined text-base">lock_clock</span>
                      ห้องประชุมยังไม่เปิด
                    </div>
                  )}
                </div>

                {/* รายละเอียด: วาระ + เอกสาร */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-4 border-t space-y-5">
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base text-primary">list_alt</span>
                        ระเบียบวาระการประชุม
                      </h4>
                      {m.agenda.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">ยังไม่มีระเบียบวาระ</p>
                      ) : (
                        <div className="space-y-1 bg-muted/50 p-3 rounded-lg border">
                          {m.agenda.map((ag) => (
                            <div key={ag.id} className="py-0.5 flex items-start gap-1.5 text-xs">
                              <span className="text-primary font-semibold shrink-0">วาระ {ag.no}:</span>
                              <span className="text-muted-foreground">{ag.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base text-primary">folder_open</span>
                        เอกสารประกอบการประชุม
                        <span className="font-normal text-muted-foreground">(ดูได้จากหน้าเว็บ)</span>
                      </h4>
                      {visibleFiles.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">ยังไม่มีเอกสารแนบ</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {visibleFiles.map((file) => (
                            <button
                              key={file.id}
                              onClick={() => openPreview(file, m)}
                              className="text-left rounded-lg border p-3 hover:border-primary/50 transition-colors flex items-center gap-3 cursor-pointer"
                            >
                              {/* ภาพตัวอย่างย่อของเอกสาร */}
                              <div className="h-12 w-10 rounded bg-white border shrink-0 shadow-sm p-1 flex flex-col gap-0.5 overflow-hidden">
                                <div className="h-0.75 w-full bg-primary/60 rounded-full" />
                                <div className="h-0.5 w-4/5 bg-border rounded-full" />
                                <div className="h-0.5 w-full bg-muted rounded-full" />
                                <div className="h-0.5 w-full bg-muted rounded-full" />
                                <div className="h-0.5 w-3/5 bg-muted rounded-full" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold truncate">{file.name}</p>
                                <p className="text-tiny text-muted-foreground truncate mt-0.5">
                                  {file.description || "เอกสารประกอบการประชุม"}
                                </p>
                                <span className="text-tiny text-primary font-semibold flex items-center gap-0.5 mt-1">
                                  <span className="material-symbols-outlined text-compact">visibility</span>
                                  ดูเอกสาร
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {sortedMeetings.length === 0 && (
          <Card className="card-shadow">
            <CardContent className="py-16 text-center">
              <span className="material-symbols-outlined text-5xl text-muted-foreground mb-2">event_busy</span>
              <p className="text-sm font-medium">ยังไม่มีการประชุมที่คุณเกี่ยวข้อง</p>
              <p className="text-xs text-muted-foreground mt-1">เมื่อมีผู้เชิญคุณเข้าประชุม รายการจะแสดงที่นี่</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* หน้าต่างอ่านเอกสาร — ดูอย่างเดียว ไม่มีดาวน์โหลด */}
      {viewingFile && (
        <DocumentLightbox
          file={viewingFile}
          onClose={() => setViewingFile(null)}
          viewerName={currentUser.name}
          confidentialityLevel={viewingMeeting?.confidentialityLevel ?? "normal"}
        />
      )}
    </div>
  );
}
