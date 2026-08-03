import type { Meeting } from "@/data";

function escapeIcs(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function formatIcsDate(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-");
  const [h, min] = timeStr.split(":");
  return `${y}${m}${d}T${h}${min}00`;
}

export function generateIcs(meeting: Meeting): string {
  const dtStart = formatIcsDate(meeting.date, meeting.startTime);
  const dtEnd = formatIcsDate(meeting.date, meeting.endTime);
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const agendaList = meeting.agenda
    .map((a) => `${a.no}. ${a.title}`)
    .join("\\n");
  const description = `วาระการประชุม:\\n${agendaList}\\n\\nสถานที่: ${meeting.location}${meeting.conferenceLink ? `\\n\\nลิงก์ประชุมออนไลน์: ${meeting.conferenceLink}` : ""}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//e-Meeting//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `DTSTAMP:${stamp}`,
    `UID:${meeting.id}@e-meeting.local`,
    `SUMMARY:${escapeIcs(meeting.name)}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${escapeIcs(meeting.location)}`,
    `ORGANIZER;CN=${escapeIcs(meeting.organizer)}:mailto:${meeting.organizerEmail}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:การประชุม ${escapeIcs(meeting.shortName)} พรุ่งนี้`,
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:การประชุม ${escapeIcs(meeting.shortName)} ในอีก 30 นาที`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

export function downloadIcs(meeting: Meeting) {
  const content = generateIcs(meeting);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meeting.shortName.replace(/\s+/g, "_")}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
