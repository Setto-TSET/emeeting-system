"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MeetingFile } from "@/data";
import { getFileObjectUrl } from "@/services/fileStorage";
import { mdToHtml } from "@/components/meeting/MarkdownViewer";

// ==========================================
// Real Document Viewer — เรนเดอร์ไฟล์จริงจาก server (PDF ผ่าน iframe, รูปผ่าน img)
// ==========================================
function RealDocumentViewer({ file }: { file: MeetingFile }) {
  const [url, setUrl] = useState<string | null>(null);
  // ค่าเริ่มต้นตัดสินจาก prop ตั้งแต่ render แรก — ไม่ต้อง setState ใน effect
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">(
    () => (file.storageKey ? "loading" : "notfound")
  );

  useEffect(() => {
    if (!file.storageKey) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    getFileObjectUrl(file.storageKey)
      .then((u) => {
        if (cancelled) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        if (!u) {
          setStatus("notfound");
          return;
        }
        objectUrl = u;
        setUrl(u);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
    return () => {
      cancelled = true;
      // คืน memory เมื่อปิด lightbox — ไม่งั้น blob URL ค้างจนปิดหน้า
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.storageKey]);

  if (status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
        กำลังโหลดไฟล์...
      </div>
    );
  }
  if (status === "notfound") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 p-8">
        <span className="material-symbols-outlined text-5xl text-muted-foreground">cloud_off</span>
        <p className="text-sm font-medium">ไม่พบไฟล์นี้</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          ไฟล์อาจถูกลบไปแล้ว หรือเป็นรายการที่ยังไม่ได้แนบไฟล์จริง — ติดต่อผู้จัดการประชุม
        </p>
      </div>
    );
  }
  if (status === "error" || !url) {
    return (
      <div className="flex-1 flex items-center justify-center text-destructive text-sm">
        โหลดไฟล์ไม่สำเร็จ
      </div>
    );
  }

  const isPdf = /pdf/i.test(file.mimeType || "") || /\.pdf$/i.test(file.name);
  const isImage = /^image\//i.test(file.mimeType || "") || /\.(png|jpg|jpeg|gif|webp)$/i.test(file.name);

  if (isPdf) {
    // iframe เรนเดอร์ PDF ด้วย native viewer ของเบราว์เซอร์ — ตั้ง toolbar=0 ซ่อนปุ่มดาวน์โหลด
    return (
      <iframe
        src={`${url}#toolbar=0&navpanes=0`}
        className="flex-1 w-full h-full rounded-lg border-0 bg-card"
        title={file.name}
      />
    );
  }
  if (isImage) {
    return (
      <div className="flex-1 flex items-center justify-center overflow-auto bg-card rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={file.name} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 p-8">
      <span className="material-symbols-outlined text-5xl text-muted-foreground">description</span>
      <p className="text-sm font-medium">ไฟล์นี้ไม่รองรับการดูในเว็บ</p>
      <p className="text-xs text-muted-foreground">
        ดูในเว็บได้เฉพาะ PDF รูปภาพ และ Markdown — ขอไฟล์ PDF จากผู้จัดการประชุม
      </p>
    </div>
  );
}

// ==========================================
// Markdown File Viewer — อ่านไฟล์ .md จาก server แล้วแสดงเป็น HTML
// ไม่มี anti-leak ตัวเอง — ผู้ที่ใช้ตัวแสดงนี้ต้องวาง DocumentWatermark ทับเอง (lightbox, จอแชร์เอกสาร)
// ==========================================
function MarkdownFileViewer({ file }: { file: MeetingFile }) {
  const [content, setContent] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">(
    () => (file.storageKey ? "loading" : "notfound")
  );

  useEffect(() => {
    if (!file.storageKey) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    getFileObjectUrl(file.storageKey)
      .then(async (url) => {
        if (cancelled) { if (url) URL.revokeObjectURL(url); return; }
        if (!url) { setStatus("notfound"); return; }
        objectUrl = url;
        const text = await fetch(url).then(r => r.text());
        if (!cancelled) { setContent(text); setStatus("ready"); }
      })
      .catch(() => { if (!cancelled) setStatus("error"); })
      .finally(() => { if (objectUrl) URL.revokeObjectURL(objectUrl); });

    return () => { cancelled = true; };
  }, [file.storageKey]);

  if (status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
        กำลังโหลดเอกสาร...
      </div>
    );
  }
  if (status === "notfound") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 p-8">
        <span className="material-symbols-outlined text-5xl text-muted-foreground">cloud_off</span>
        <p className="text-sm font-medium">ไม่พบไฟล์นี้</p>
      </div>
    );
  }
  if (status === "error" || !content) {
    return (
      <div className="flex-1 flex items-center justify-center text-destructive text-sm">
        โหลดเอกสารไม่สำเร็จ
      </div>
    );
  }



  return (
    <div className="flex-1 overflow-auto bg-card rounded-lg">
      <div
        className="md-root p-6"
        dangerouslySetInnerHTML={{ __html: mdToHtml(content) }}
      />
    </div>
  );
}

// ==========================================
// เลือกตัวแสดงตามชนิดไฟล์ — ใช้ทั้งใน lightbox และในจอแชร์เอกสารของห้องประชุม
// ไม่มีหน้าเอกสาร "จำลอง" ให้ fallback แล้ว ไฟล์ที่ไม่มีของจริงแสดงว่าไม่พบไฟล์ตรง ๆ
// ==========================================
export function DocumentContent({ file }: { file: MeetingFile }) {
  const isMarkdown = file.mimeType === "text/markdown" || file.name.endsWith(".md");
  return isMarkdown ? <MarkdownFileViewer file={file} /> : <RealDocumentViewer file={file} />;
}

// ==========================================
// Watermark — ทับทุกหน้าเอกสารที่แสดงในระบบ (lightbox และจอแชร์เอกสารในห้องประชุม)
//   1. แถบคาดใหญ่ "สภาเภสัชกรรม" กลางเอกสาร — บอกว่าเป็นเอกสารของหน่วยงาน
//   2. ลายน้ำย่อยซ้ำทั้งหน้า "สภาเภสัชกรรม · ชื่อผู้ดู · เวลา" — ภาพที่ถูกถ่ายออกไปจะระบุได้ว่าใครเปิดเมื่อไร
// เวลาอัปเดตตามรอบ (ค่าเริ่มต้น 30 วิ) — เป็นเพียงตัวยับยั้ง ไม่ใช่การป้องกัน (ดูแผน anti-leak)
// ==========================================
export const WATERMARK_ORG = "สภาเภสัชกรรม";

export function DocumentWatermark({ viewerName, intervalMs = 30_000 }: { viewerName: string; intervalMs?: number }) {
  const [ts, setTs] = useState(() =>
    new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
  );
  useEffect(() => {
    const id = setInterval(() => {
      setTs(new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }));
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const text = `${WATERMARK_ORG} · ${viewerName} · ${ts}`;
  const rows = 6;
  const cols = 4;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden select-none z-10">
      <div className="w-full h-full grid" style={{ gridTemplateRows: `repeat(${rows}, 1fr)`, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: rows * cols }).map((_, i) => (
          <div key={i} className="flex items-center justify-center">
            <span className="-rotate-30 text-caption font-medium text-foreground/15 whitespace-nowrap">{text}</span>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="-rotate-30 whitespace-nowrap text-4xl font-bold tracking-widest text-primary/15 sm:text-6xl md:text-7xl">
          {WATERMARK_ORG}
        </span>
      </div>
    </div>
  );
}

// ==========================================
// Lightbox wrapper — เปิดอ่านเอกสารเต็มจอ (อ่านอย่างเดียว + ชั้นยับยั้งการรั่วไหล)
// ==========================================
type ConfidentialityLevel = "normal" | "restricted" | "top_secret";

type DocumentLightboxProps = {
  file: MeetingFile;
  onClose: () => void;
  /** ชื่อผู้ดู — ใส่ในลายน้ำและป้ายท้ายบอก audit */
  viewerName?: string;
  /** ระดับความลับของการประชุม — กำหนดพฤติกรรม watermark และ UI เตือน */
  confidentialityLevel?: ConfidentialityLevel;
};

const confidentialityConfig: Record<ConfidentialityLevel, { label: string; color: string; watermarkInterval: number }> = {
  normal:     { label: "",             color: "",                          watermarkInterval: 30_000 },
  restricted: { label: "ลับ",         color: "bg-warning text-warning-foreground",   watermarkInterval: 15_000 },
  top_secret: { label: "ลับมาก",      color: "bg-destructive text-destructive-foreground", watermarkInterval: 5_000  },
};

export function DocumentLightbox({ file, onClose, viewerName, confidentialityLevel = "normal" }: DocumentLightboxProps) {
  // เบลอเนื้อหาเมื่อสลับหน้าต่าง — กันคนถ่ายจอจากด้านหลัง / กด Alt+PrtSc ขณะไม่ได้จ้องอยู่
  const [windowActive, setWindowActive] = useState(true);
  useEffect(() => {
    const onVis = () => setWindowActive(document.visibilityState === "visible");
    const onBlur = () => setWindowActive(false);
    const onFocus = () => setWindowActive(true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // ปิด Ctrl/Cmd+P (print) เพราะ print → save as PDF = ดาวน์โหลดทางอ้อม
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cfg = confidentialityConfig[confidentialityLevel];
  const isTopSecret = confidentialityLevel === "top_secret";

  return (
    <div
      className="fixed inset-0 z-[2000] bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
      onContextMenu={(e) => e.preventDefault()}
      style={isTopSecret ? { userSelect: "none" } : undefined}
    >
      <div className="w-full max-w-4xl h-[85dvh] bg-card border border-border rounded-3xl overflow-hidden flex flex-col shadow-2xl relative">
        {/* แถบความลับ — แสดงเฉพาะ restricted / top_secret */}
        {cfg.label && (
          <div className={`shrink-0 h-7 ${cfg.color} flex items-center justify-center gap-2 text-xs font-bold`}>
            <span className="material-symbols-outlined text-sm">lock</span>
            ชั้นความลับ: {cfg.label} · ห้ามเผยแพร่หรือทำซ้ำ
          </div>
        )}

        {/* Lightbox header */}
        <div className="h-14 bg-muted px-6 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-primary">menu_book</span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground truncate">{file.name}</h3>
              <p className="text-tiny text-muted-foreground truncate">{file.description || "เอกสารประกอบการประชุม"}</p>
            </div>
          </div>

          <Button
            onClick={onClose}
            variant="ghost"
            className="text-muted-foreground hover:text-foreground rounded-full hover:bg-muted"
            size="icon"
            aria-label="ปิดเอกสาร"
          >
            <span className="material-symbols-outlined">close</span>
          </Button>
        </div>

        {/* Viewer canvas — พื้นเทาให้แผ่นเอกสารสีขาวเด่นขึ้นมา */}
        <div className="flex-1 relative bg-muted/60 overflow-hidden">
          <div
            className={`absolute inset-0 p-6 flex flex-col ${windowActive ? "" : "blur-lg"} transition-[filter] duration-150`}
          >
            <DocumentContent file={file} />
          </div>
          {/* Watermark ทับด้านบนสุด (z-10) — screenshot จะติดลายน้ำนี้ไปด้วย */}
          <DocumentWatermark viewerName={viewerName ?? "ผู้ชม"} intervalMs={cfg.watermarkInterval} />
          {/* Overlay เมื่อหน้าต่างไม่ active (z-20) — ครอบทั้ง iframe + เนื้อหาทุกชนิด */}
          {!windowActive && (
            <div className="absolute inset-0 z-20 bg-background/90 backdrop-blur-md flex items-center justify-center">
              <div className="text-center">
                <span className="material-symbols-outlined text-4xl text-muted-foreground">visibility_off</span>
                <p className="text-sm font-medium mt-2">หน้าต่างไม่ active — เนื้อหาถูกซ่อน</p>
                <p className="text-xs text-muted-foreground mt-1">กลับมาที่หน้านี้เพื่อดูต่อ</p>
              </div>
            </div>
          )}
        </div>

        {/* Viewer footer — อ่านอย่างเดียว ไม่มีดาวน์โหลด */}
        <div className="h-12 border-t border-border bg-muted px-6 flex items-center justify-between shrink-0 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm text-muted-foreground">visibility</span>
            อ่านได้จากหน้าเว็บเท่านั้น · ผู้จัดทำ: {file.uploadedBy}
          </span>
          <Button onClick={onClose} size="sm" className="bg-secondary hover:bg-secondary/80 text-secondary-foreground">
            ปิดการอ่าน
          </Button>
        </div>
      </div>
    </div>
  );
}
