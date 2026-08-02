"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getVisibleDocuments,
  fileVisibilityLabels,
  fileVisibilityColors,
  fileVisibilityIcons,
  fileTypeLabels,
  systemRoleLabels,
  systemRoleColors,
  committees,
  FileVisibility,
  MeetingFile,
} from "@/data";
import { useCurrentUser } from "@/context/UserContext";
import { useMeetings } from "@/context/MeetingContext";
import { DocumentLightbox } from "@/components/meeting/DocumentPreview";

const iconSm = "material-symbols-outlined text-[16px]";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function fileIcon(name: string) {
  if (name.endsWith(".pdf")) return "picture_as_pdf";
  if (name.endsWith(".docx")) return "description";
  if (name.endsWith(".xlsx")) return "table_chart";
  return "attach_file";
}

const typeOptions: { value: MeetingFile["type"] | "all"; label: string }[] = [
  { value: "all", label: "ทุกประเภท" },
  { value: "regulation", label: "ระเบียบ/คำสั่ง" },
  { value: "attachment", label: "เอกสารประกอบ" },
  { value: "report_draft", label: "ร่างรายงาน" },
  { value: "report_final", label: "รายงานฉบับสมบูรณ์" },
];

const visibilityOptions: { value: FileVisibility | "all"; label: string }[] = [
  { value: "all", label: "ทุก visibility" },
  { value: "public", label: "สาธารณะ" },
  { value: "committee", label: "เฉพาะคณะทำงาน" },
  { value: "participants", label: "เฉพาะผู้เข้าร่วม" },
  { value: "restricted", label: "จำกัดสิทธิ์" },
];

export default function DocumentsPage() {
  const { currentUser } = useCurrentUser();
  const { meetings } = useMeetings();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [visFilter, setVisFilter] = useState<string>("all");
  const [committeeFilter, setCommitteeFilter] = useState<string>("all");
  const [view, setView] = useState<"tree" | "list">("tree");

  const [previewFile, setPreviewFile] = useState<MeetingFile | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewZoom, setPreviewZoom] = useState(100);
  const openPreview = (file: MeetingFile) => {
    setPreviewFile(file);
    setPreviewPage(1);
    setPreviewZoom(100);
  };

  const allDocs = useMemo(() => getVisibleDocuments(currentUser, meetings), [currentUser, meetings]);
  const totalDocs = meetings.reduce((s, m) => s + m.files.length, 0);
  const hiddenCount = totalDocs - allDocs.length;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return allDocs.filter(({ file, meeting }) => {
      if (typeFilter !== "all" && file.type !== typeFilter) return false;
      if (visFilter !== "all" && file.visibility !== visFilter) return false;
      if (committeeFilter !== "all" && meeting.committee !== committeeFilter) return false;
      if (!qq) return true;
      return (
        file.name.toLowerCase().includes(qq) ||
        file.description.toLowerCase().includes(qq) ||
        meeting.name.toLowerCase().includes(qq)
      );
    });
  }, [allDocs, q, typeFilter, visFilter, committeeFilter]);

  // Grouped for tree view: committee -> meeting -> type -> files[]
  const tree = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, { file: MeetingFile; meeting: typeof meetings[number] }[]>>>();
    for (const entry of filtered) {
      const c = entry.meeting.committee;
      const mKey = entry.meeting.id;
      const t = entry.file.type;
      if (!map.has(c)) map.set(c, new Map());
      const cMap = map.get(c)!;
      if (!cMap.has(mKey)) cMap.set(mKey, new Map());
      const mMap = cMap.get(mKey)!;
      if (!mMap.has(t)) mMap.set(t, []);
      mMap.get(t)!.push(entry);
    }
    return map;
  }, [filtered]);

  // Stat cards
  const stats = useMemo(() => {
    const byVis: Record<string, number> = { public: 0, committee: 0, participants: 0, restricted: 0 };
    for (const { file } of allDocs) byVis[file.visibility]++;
    return byVis;
  }, [allDocs]);

  return (
    <div className="p-4 md:p-6 pb-16 max-w-[1400px] mx-auto">
      {/* Header */}
      <header className="mb-5">
        <h1 className="text-lg md:text-xl font-semibold mb-0.5">คลังเอกสาร</h1>
        <p className="text-xs text-muted-foreground">
          รวมเอกสารทุกการประชุมที่คุณมีสิทธิ์เข้าถึง จัดกลุ่มตามคณะทำงาน · การประชุม · ประเภท
        </p>
      </header>

      {/* Access Summary */}
      <Card className="card-shadow mb-4 border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">shield_person</span>
            <div>
              <p className="text-sm font-medium">
                กำลังดูในฐานะ: <span className="font-semibold">{currentUser.name}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">{currentUser.position} · {currentUser.department}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:ml-auto">
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${systemRoleColors[currentUser.systemRole]}`}>
              {systemRoleLabels[currentUser.systemRole]}
            </span>
            <div className="text-xs text-muted-foreground">
              เห็นได้ <span className="font-semibold text-foreground">{allDocs.length}</span> / {totalDocs} ไฟล์
              {hiddenCount > 0 && (
                <span className="ml-1.5 text-amber-600">
                  ({hiddenCount} ไฟล์ถูกซ่อนตามสิทธิ์)
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        {(["public", "committee", "participants", "restricted"] as FileVisibility[]).map(v => (
          <Card key={v} className="card-shadow">
            <CardContent className="p-3 flex items-center gap-2">
              <div className={`h-8 w-8 rounded-lg border flex items-center justify-center ${fileVisibilityColors[v]}`}>
                <span className={iconSm}>{fileVisibilityIcons[v]}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground truncate">{fileVisibilityLabels[v]}</p>
                <p className="text-lg font-semibold leading-none">{stats[v]}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="card-shadow mb-4">
        <CardContent className="p-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border px-2 h-9 bg-muted/40 min-w-[240px] flex-1 max-w-md">
            <span className={iconSm + " text-muted-foreground"}>search</span>
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="ค้นหาชื่อไฟล์, คำอธิบาย, ชื่อการประชุม..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="h-9 border rounded-md px-2 text-sm bg-transparent">
            {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={visFilter} onChange={e => setVisFilter(e.target.value)} className="h-9 border rounded-md px-2 text-sm bg-transparent">
            {visibilityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={committeeFilter} onChange={e => setCommitteeFilter(e.target.value)} className="h-9 border rounded-md px-2 text-sm bg-transparent">
            <option value="all">ทุกคณะทำงาน</option>
            {committees.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <div className="ml-auto flex gap-1 rounded-md border p-0.5">
            <button
              onClick={() => setView("tree")}
              className={`h-7 px-2 text-xs rounded ${view === "tree" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}
            >
              <span className={iconSm}>account_tree</span> Tree
            </button>
            <button
              onClick={() => setView("list")}
              className={`h-7 px-2 text-xs rounded ${view === "list" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}
            >
              <span className={iconSm}>view_list</span> List
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {filtered.length === 0 ? (
        <Card className="card-shadow">
          <CardContent className="p-10 text-center">
            <span className="material-symbols-outlined text-muted-foreground text-[40px]">folder_off</span>
            <p className="text-sm text-muted-foreground mt-2">ไม่พบเอกสารที่ตรงกับเงื่อนไข</p>
            {hiddenCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                (มีเอกสารอีก {hiddenCount} ไฟล์ในระบบที่คุณไม่มีสิทธิ์เข้าถึง)
              </p>
            )}
          </CardContent>
        </Card>
      ) : view === "list" ? (
        <Card className="card-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ทั้งหมด ({filtered.length})</CardTitle>
            <CardDescription className="text-xs">รายการเอกสารทั้งหมดที่ผ่านตัวกรอง</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {filtered.map(({ file, meeting }) => (
              <FileRow key={file.id + meeting.id} file={file} meetingId={meeting.id} meetingName={meeting.name} meetingDate={meeting.date} onPreview={openPreview} />
            ))}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {Array.from(tree.entries()).map(([committeeName, meetingMap]) => (
            <Card key={committeeName} className="card-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span className={iconSm + " text-primary"}>groups</span>
                  <CardTitle className="text-sm">{committeeName}</CardTitle>
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {Array.from(meetingMap.values()).reduce((s, tm) => s + Array.from(tm.values()).reduce((a, b) => a + b.length, 0), 0)} ไฟล์
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from(meetingMap.entries()).map(([mId, typeMap]) => {
                  const m = meetings.find(x => x.id === mId)!;
                  return (
                    <div key={mId} className="rounded-lg border">
                      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2">
                        <span className={iconSm + " text-muted-foreground"}>event_note</span>
                        <Link href={`/meetings/${m.id}`} className="text-sm font-semibold hover:text-primary hover:underline truncate">
                          {m.name}
                        </Link>
                        <span className="text-[11px] text-muted-foreground ml-auto flex-shrink-0">{fmtDate(m.date)}</span>
                      </div>
                      <div className="p-3 space-y-3">
                        {Array.from(typeMap.entries()).map(([type, files]) => (
                          <div key={type}>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                              <span className={iconSm}>folder</span>
                              {fileTypeLabels[type as MeetingFile["type"]]}
                              <span className="text-muted-foreground/70">({files.length})</span>
                            </p>
                            <div className="space-y-1.5 pl-4 border-l-2 border-border">
                              {files.map(({ file, meeting }) => (
                                <FileRow key={file.id} file={file} meetingId={meeting.id} meetingName={meeting.name} meetingDate={meeting.date} compact onPreview={openPreview} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* หน้าต่างอ่านเอกสารสำหรับผู้เข้าร่วม — ดูอย่างเดียว ไม่มีดาวน์โหลด */}
      {previewFile && (
        <DocumentLightbox
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          currentPage={previewPage}
          setCurrentPage={setPreviewPage}
          zoom={previewZoom}
          setZoom={setPreviewZoom}
          viewerName={currentUser.name}
        />
      )}
    </div>
  );
}

function FileRow({
  file,
  meetingId,
  meetingName,
  meetingDate,
  compact = false,
  onPreview,
}: {
  file: MeetingFile;
  meetingId: string;
  meetingName: string;
  meetingDate: string;
  compact?: boolean;
  onPreview?: (file: MeetingFile) => void;
}) {
  return (
    <div className={`rounded-lg border p-2.5 flex items-center gap-3 hover:border-primary/50 transition-colors ${compact ? "" : "bg-card"}`}>
      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-primary text-[20px]">{fileIcon(file.name)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-[11px] text-muted-foreground truncate">{file.description}</p>
        {!compact && (
          <div className="flex items-center gap-2 mt-0.5">
            <Link href={`/meetings/${meetingId}`} className="text-[11px] text-primary hover:underline truncate">
              {meetingName}
            </Link>
            <span className="text-[10px] text-muted-foreground">· {fmtDate(meetingDate)}</span>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {file.uploadedBy} · {file.uploadedAt} · {file.size}
        </p>
      </div>
      <Badge className={`text-[10px] border ${fileVisibilityColors[file.visibility]}`} variant="secondary">
        <span className="material-symbols-outlined text-[11px] mr-0.5">{fileVisibilityIcons[file.visibility]}</span>
        {fileVisibilityLabels[file.visibility]}
      </Badge>
      {/* ดูอย่างเดียวทุกบทบาท — ระบบไม่มีการดาวน์โหลดไฟล์ออกนอกเว็บ */}
      <Button size="sm" variant="ghost" className="text-primary" onClick={() => onPreview?.(file)}>
        <span className={`${iconSm} mr-1`}>visibility</span>
        ดูเอกสาร
      </Button>
    </div>
  );
}
