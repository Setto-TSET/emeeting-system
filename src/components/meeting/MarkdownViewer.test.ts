import { describe, expect, it } from "vitest";
import { mdToHtml } from "./MarkdownViewer";

describe("mdToHtml", () => {
  it("ไม่ปล่อย HTML ดิบจากเอกสารออกไปเป็น element จริง", () => {
    const html = mdToHtml('## สรุป\n<img src=x onerror="alert(1)">\n<script>alert(2)</script>');
    expect(html).not.toMatch(/<img|<script/);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("markdown ปกติยังแปลงได้เหมือนเดิม", () => {
    const html = mdToHtml("# หัวข้อ\n> อ้างอิง\n- **มติ** เห็นชอบ\n| a | b |");
    expect(html).toContain("<h1 class='md-h1'>หัวข้อ</h1>");
    expect(html).toContain("<blockquote class='md-blockquote'>อ้างอิง</blockquote>");
    expect(html).toContain("<li><strong>มติ</strong> เห็นชอบ</li>");
    expect(html).toContain("<td class='md-td'>a</td>");
  });
});
