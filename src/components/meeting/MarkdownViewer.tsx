// ─── Simple Markdown → HTML (ไม่ใช้ library ภายนอก) ───
// ผลลัพธ์ไปเข้า dangerouslySetInnerHTML — ต้อง escape ข้อความทั้งหมดก่อนแปลง markdown เสมอ
// ไฟล์ .md มาจากผู้อัปโหลด และร่างรายงาน AI มาจากคำพูดในห้อง ถ้าไม่ escape
// <img onerror=...> ในเอกสารจะรันบนหน้าเว็บเรา แล้วขโมย JWT ใน sessionStorage ได้
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function mdToHtml(md: string): string {
  const html = escapeHtml(md)
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
    .replace(/^&gt; (.+)$/gm, "<blockquote class='md-blockquote'>$1</blockquote>")
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
