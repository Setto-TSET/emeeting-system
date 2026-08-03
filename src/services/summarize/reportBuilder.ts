// ═══════════════════════════════════════════
// Report Builder — แปลง MeetingSummary เป็น Markdown และ PDF Blob
// ═══════════════════════════════════════════

import type { Meeting } from "@/data";
import type { MeetingSummary } from "./types";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function thaiDate(iso: string): string {
  // "2026-07-25" → "25 กรกฎาคม 2569"
  const months = [
    "มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
    "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม",
  ];
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${months[m - 1]} ${y + 543}`;
}

export function buildReportMarkdown(meeting: Meeting, summary: MeetingSummary): string {
  const lines: string[] = [];

  // ── หัวรายงาน ──
  lines.push(`# รายงานการประชุม (ร่าง)`);
  lines.push(``);
  lines.push(`**ชื่อการประชุม:** ${meeting.name}`);
  lines.push(`**วันที่:** ${thaiDate(meeting.date)}`);
  lines.push(`**เวลา:** ${meeting.startTime} – ${meeting.endTime} น.`);
  lines.push(`**สถานที่:** ${meeting.location}`);
  lines.push(`**คณะทำงาน:** ${meeting.committee}`);
  lines.push(`**ผู้จัด:** ${meeting.organizer}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // ── ผู้เข้าร่วมประชุม ──
  lines.push(`## ผู้เข้าร่วมประชุม`);
  lines.push(``);
  lines.push(`| ชื่อ | ตำแหน่ง | หน่วยงาน | การเข้าร่วม |`);
  lines.push(`|---|---|---|---|`);

  const attendanceLabels: Record<string, string> = {
    attend: "เข้าร่วม",
    representative: "มอบหมาย",
    absent: "ขาด",
    pending: "รอยืนยัน",
  };

  for (const p of meeting.participants) {
    const att = p.attendance ? (attendanceLabels[p.attendance] ?? "-") : "เข้าร่วม";
    lines.push(`| ${p.name} | ${p.position || p.role} | ${p.department || "-"} | ${att} |`);
  }
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // ── สรุปตามวาระ ──
  lines.push(`## สรุปการประชุมตามระเบียบวาระ`);
  lines.push(``);

  if (summary.byAgenda.length > 0) {
    for (const ag of summary.byAgenda) {
      const agItem = meeting.agenda.find(a => a.id === ag.agendaId);
      const agTitle = agItem ? `วาระที่ ${agItem.no} — ${agItem.title}` : `วาระ ${ag.agendaId}`;

      lines.push(`### ${agTitle}`);
      lines.push(``);
      lines.push(`**สรุปการอภิปราย:**`);
      lines.push(``);
      lines.push(ag.discussion);
      lines.push(``);

      if (ag.resolutions.length > 0) {
        lines.push(`**มติที่ประชุม:**`);
        lines.push(``);
        for (const r of ag.resolutions) {
          lines.push(`- ${r}`);
        }
        lines.push(``);
      }

      if (ag.actionItems.length > 0) {
        lines.push(`**ข้อสั่งการ:**`);
        lines.push(``);
        for (const a of ag.actionItems) {
          const owner = a.ownerName ? ` *(ผู้รับผิดชอบ: ${a.ownerName})*` : "";
          lines.push(`- ${a.text}${owner}`);
        }
        lines.push(``);
      }
    }
  } else {
    // ไม่มี agenda windows — แสดงวาระจากรายชื่อ + overall summary
    for (const ag of meeting.agenda) {
      lines.push(`### วาระที่ ${ag.no} — ${ag.title}`);
      lines.push(``);
      lines.push(`*(ที่ประชุมได้พิจารณาและมีผลการพิจารณาตามที่บันทึกในสรุปภาพรวม)*`);
      lines.push(``);
    }
  }

  // ── สรุปภาพรวม ──
  lines.push(`---`);
  lines.push(``);
  lines.push(`## สรุปภาพรวมการประชุม`);
  lines.push(``);
  lines.push(summary.overall);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // ── ลายเซ็น ──
  lines.push(`## การรับรอง`);
  lines.push(``);
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| ผู้จดบันทึก | .......................................... |`);
  lines.push(`| ผู้รับรองรายงาน | .......................................... |`);
  lines.push(`| วันที่รับรอง | .......................................... |`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // ── ข้อความกำกับ ──
  const now = new Date();
  const generatedAt = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear() + 543} ${pad2(now.getHours())}:${pad2(now.getMinutes())} น.`;
  lines.push(`> **ร่างเอกสารนี้สร้างโดยระบบ AI อัตโนมัติ** เมื่อ ${generatedAt}`);
  lines.push(`>`);
  lines.push(`> ต้องผ่านการตรวจสอบ แก้ไข และรับรองโดยเลขานุการก่อนถือเป็นเอกสารทางการ`);
  lines.push(``);

  return lines.join("\n");
}

function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, "<hr>")
    .replace(/^\| (.+) \|$/gm, (line) => {
      if (line.includes("---|")) return "";
      const cells = line.split("|").filter(c => c.trim() !== "").map(c => `<td>${c.trim()}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .replace(/(<tr>[\s\S]*?<\/tr>\n*)+/gm, (t) => `<table>${t}</table>`)
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>\n*)+/gm, (l) => `<ul>${l}</ul>`)
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/^(?!<[h1-6|table|ul|li|hr|blockquote])(.+)$/gm, "<p>$1</p>")
    .replace(/<\/p><p>/g, "\n")
    .trim();
}

export function buildReportPdfBlob(meeting: Meeting, summary: MeetingSummary): Blob {
  const md = buildReportMarkdown(meeting, summary);
  const body = markdownToHtml(md);

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>รายงานการประชุม — ${meeting.name}</title>
<style>
  @page { size: A4; margin: 2.5cm 2cm; }
  body { font-family: 'Sarabun', 'TH SarabunPSK', 'Noto Sans Thai', sans-serif; font-size: 14pt; line-height: 1.8; color: #000; }
  h1 { font-size: 18pt; text-align: center; border-bottom: 2px solid #000; padding-bottom: 4px; }
  h2 { font-size: 15pt; margin-top: 24px; }
  h3 { font-size: 13pt; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  td, th { border: 1px solid #888; padding: 6px 8px; }
  ul { padding-left: 1.5em; }
  li { margin: 2px 0; }
  hr { border: none; border-top: 1px solid #bbb; margin: 16px 0; }
  blockquote { border-left: 3px solid #f90; padding-left: 12px; color: #555; font-size: 11pt; margin: 12px 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;

  return new Blob([html], { type: "text/html; charset=utf-8" });
}
