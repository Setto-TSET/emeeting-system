"use client";

import { useEffect, useState } from "react";

interface MarkdownViewerProps {
  content: string;
  viewerName: string;
  className?: string;
}

// ─── Simple Markdown → HTML (ไม่ใช้ library ภายนอก) ───
export function mdToHtml(md: string): string {
  let html = md
    // headings
    .replace(/^### (.+)$/gm, "<h3 class='md-h3'>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 class='md-h2'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 class='md-h1'>$1</h1>")
    // bold / italic
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // horizontal rule
    .replace(/^---$/gm, "<hr class='md-hr'>")
    // blockquote (ต้องก่อน paragraph)
    .replace(/^> (.+)$/gm, "<blockquote class='md-blockquote'>$1</blockquote>")
    // table rows
    .replace(/^\|(.+)\|$/gm, (row) => {
      if (/^\|[\s|:-]+\|$/.test(row)) return ""; // separator row
      const cells = row.slice(1, -1).split("|").map(c =>
        `<td class='md-td'>${c.trim()}</td>`
      ).join("");
      return `<tr class='md-tr'>${cells}</tr>`;
    })
    // wrap consecutive <tr> in <table>
    .replace(/(<tr[\s\S]*?<\/tr>\n*)+/g, t => `<table class='md-table'>${t}</table>`)
    // list items
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // wrap consecutive <li> in <ul>
    .replace(/(<li>[\s\S]*?<\/li>\n*)+/g, l => `<ul class='md-ul'>${l}</ul>`)
    // blank lines → paragraph breaks
    .replace(/\n{2,}/g, "\n\n")
    .trim();

  // wrap plain text lines in <p>
  const lines = html.split("\n");
  const result: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    const isBlock = /^<(h[1-6]|table|ul|li|hr|blockquote|tr|td)/.test(line.trim());
    if (isBlock) {
      if (inBlock) { result.push("</p>"); inBlock = false; }
      result.push(line);
    } else if (line.trim() === "") {
      if (inBlock) { result.push("</p>"); inBlock = false; }
    } else {
      if (!inBlock) { result.push("<p class='md-p'>"); inBlock = true; }
      result.push(line);
    }
  }
  if (inBlock) result.push("</p>");
  return result.join("\n");
}

const styles = `
  .md-root { font-family: 'Sarabun','TH SarabunPSK','Noto Sans Thai',sans-serif; font-size: 15px; line-height: 1.9; color: inherit; }
  .md-h1 { font-size: 1.5em; font-weight: 700; border-bottom: 2px solid currentColor; padding-bottom: 4px; margin: 16px 0 8px; }
  .md-h2 { font-size: 1.2em; font-weight: 700; margin: 20px 0 6px; }
  .md-h3 { font-size: 1.05em; font-weight: 600; margin: 16px 0 4px; }
  .md-p  { margin: 6px 0; }
  .md-hr { border: none; border-top: 1px solid #aaa; margin: 16px 0; }
  .md-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  .md-td { border: 1px solid #888; padding: 5px 8px; }
  .md-ul { padding-left: 1.4em; margin: 4px 0; }
  .md-blockquote { border-left: 3px solid #f90; padding-left: 12px; color: #888; font-size: 0.88em; margin: 12px 0; }
`;

export function MarkdownViewer({ content, viewerName, className = "" }: MarkdownViewerProps) {
  const [windowActive, setWindowActive] = useState(true);

  useEffect(() => {
    const onBlur  = () => setWindowActive(false);
    const onFocus = () => setWindowActive(true);
    const onVis   = () => setWindowActive(!document.hidden);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const html = mdToHtml(content);

  return (
    <div
      className={`relative select-none overflow-auto ${className}`}
      onContextMenu={e => e.preventDefault()}
    >
      <style>{styles}</style>

      {/* Watermark grid */}
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="absolute text-black/20 dark:text-white/20 text-xs font-medium whitespace-nowrap"
            style={{
              top: `${(i % 6) * 17}%`,
              left: `${Math.floor(i / 6) * 25}%`,
              transform: "rotate(-30deg)",
            }}
          >
            {viewerName}
          </div>
        ))}
      </div>

      {/* Blur overlay when window loses focus */}
      {!windowActive && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/90 backdrop-blur-md">
          <p className="text-sm font-medium text-muted-foreground">
            หน้าต่างไม่ active — เนื้อหาถูกซ่อน
          </p>
        </div>
      )}

      {/* Markdown content */}
      <div
        className="md-root p-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
