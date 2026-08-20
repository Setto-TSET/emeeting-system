# Design System — สภาเภสัชกรรม (Pharmacy Council) Web Apps

ระบบดีไซน์นี้สกัดจากเว็บ e-Meeting (Next.js + Tailwind v4 + shadcn/ui) นำไปใช้ซ้ำกับเว็บอื่นในเครือสภาเภสัชกรรมได้ทันที — คัดลอกค่าตัวแปรสี/ฟอนต์/component pattern ด้านล่างไปวางในโปรเจกต์ใหม่

## Stack

- **Next.js** (App Router) + **Tailwind CSS v4** (`@theme inline` + CSS variables, ไม่ใช้ `tailwind.config.js` แบบเดิม)
- **shadcn/ui** — `style: "radix-rhea"`, `baseColor: "neutral"`, `cssVariables: true`, `iconLibrary: "lucide"`
- ไอคอนหลัก: **Material Symbols Outlined** (Google Fonts, variable font) — ใช้คู่กับ lucide สำหรับ shadcn primitives
- ฟอนต์: **Kanit** (ไทย, น้ำหนัก 300/400/500/600) เป็นฟอนต์หลัก, **Geist** เป็น fallback/ละติน
- Toast: `sonner` (`richColors`, position `bottom-right`)

## Color Tokens

กำหนดเป็น CSS variables ใน `:root` (light) และ `.dark` (dark) แล้ว map เข้า Tailwind ผ่าน `@theme inline`. เปลี่ยนแค่ `--primary` / `--sidebar*` ก็เปลี่ยนธีมทั้งเว็บได้ — **สีหลักของ e-Meeting คือมะกอกเข้ม `#737300`** (จุดสังเกตเฉพาะระบบนี้ เว็บอื่นเปลี่ยนเป็นสีองค์กรของตัวเองตรงนี้จุดเดียว)

```css
:root {
  --background: #f5f5f5;
  --foreground: #111827;
  --card: #ffffff;
  --card-foreground: #111827;
  --popover: #ffffff;
  --popover-foreground: #111827;
  --primary: #737300;           /* ← สีองค์กร เปลี่ยนตรงนี้ */
  --primary-foreground: #ffffff;
  --secondary: #f3f4f6;
  --secondary-foreground: #1f2937;
  --muted: #f3f4f6;
  --muted-foreground: #6b7280;
  --accent: #f3f4f6;
  --accent-foreground: #111827;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: #e5e7eb;
  --input: #e5e7eb;
  --ring: #737300;
  --chart-1: #737300;
  --chart-2: #84cc16;
  --chart-3: #10b981;
  --chart-4: #0ea5e9;
  --chart-5: #6366f1;
  --radius: 0.5rem;

  /* Sidebar ใช้สีองค์กรเป็นพื้นหลัง (เข้มกว่า background หลัก) */
  --sidebar: #737300;
  --sidebar-foreground: #ffffff;
  --sidebar-primary: #ffffff;
  --sidebar-primary-foreground: #737300;
  --sidebar-accent: #8a8a00;      /* hover state ในเมนู */
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: #8a8a00;
  --sidebar-ring: #737300;
}

.dark {
  --background: #111827;
  --foreground: #f9fafb;
  --card: #1f2937;
  --card-foreground: #f9fafb;
  --popover: #1f2937;
  --popover-foreground: #f9fafb;
  --primary: #8a8a00;
  --primary-foreground: #ffffff;
  --secondary: #374151;
  --secondary-foreground: #f9fafb;
  --muted: #374151;
  --muted-foreground: #9ca3af;
  --accent: #374151;
  --accent-foreground: #f9fafb;
  --destructive: #7f1d1d;
  --destructive-foreground: #fef2f2;
  --border: #374151;
  --input: #374151;
  --ring: #8a8a00;
  --sidebar: #1f2937;
  --sidebar-foreground: #f9fafb;
  --sidebar-primary: #8a8a00;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #374151;
  --sidebar-accent-foreground: #f9fafb;
  --sidebar-border: #374151;
  --sidebar-ring: #8a8a00;
}
```

Tailwind mapping (`@theme inline` — วางบนหัวไฟล์ `globals.css`):

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-kanit), var(--font-sans);
  --font-mono: var(--font-mono);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
```

## Typography

- ฟอนต์หลัก **Kanit** โหลดผ่าน `next/font/google`, subset `["thai", "latin"]`, weight `["300", "400", "500", "600"]`
- ฟอนต์ fallback ละติน **Geist** (`400`–`700`)
- ทั้งคู่ผูกกับ CSS var แล้วประกาศใน `@theme inline` เป็น `--font-sans`

```tsx
import { Geist, Kanit } from "next/font/google";

const geist = Geist({ variable: "--font-sans", subsets: ["latin"], weight: ["400","500","600","700"] });
const kanit = Kanit({ variable: "--font-kanit", subsets: ["thai","latin"], weight: ["300","400","500","600"] });

// <html className={`${geist.variable} ${kanit.variable} h-full antialiased`}>
```

## Layout พื้นหลัง (Body Background)

พื้นหลังทั้งเว็บไม่ใช่สีเรียบ แต่เป็น gradient เบา ๆ คงที่ (fixed) ให้ความรู้สึกนุ่มนวลกว่าสีขาวล้วน:

```css
body {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  background-attachment: fixed;
}
```

## Glassmorphism (จุดเด่นของดีไซน์นี้)

Card, popover, sidebar ใช้เอฟเฟกต์กระจกฝ้า (frosted glass) แทนพื้นทึบธรรมดา — เป็น signature look ของระบบนี้ ควรคงไว้เวลาย้ายไปเว็บอื่น:

```css
.glass-panel {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 8px 32px 0 rgba(115, 115, 0, 0.05); /* เงาใช้สี primary เจือจาง */
}

.dark .glass-panel {
  background: rgba(31, 41, 55, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
}

/* เวอร์ชันทึบสีองค์กร — ใช้กับ sidebar */
.glass-panel-primary {
  background: rgba(115, 115, 0, 0.85); /* = primary ที่ 85% alpha */
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.15);
}

.card-shadow {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
}

.radial-bg {
  background: radial-gradient(circle at center, #ffffff 0%, #f5f5f5 100%);
}
```

**Card component** (`components/ui/card.tsx`) ใช้ `glass-panel` เป็นพื้นหลังโดยตรง, มุมโค้งมาก (`rounded-[min(var(--radius-4xl),24px)]`), spacing ผูกกับ CSS var `--card-spacing` (ปรับตาม `size="default" | "sm"`):

```tsx
<div className="group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-[min(var(--radius-4xl),24px)] glass-panel py-(--card-spacing) text-sm text-card-foreground shadow-sm ring-0 [--card-spacing:--spacing(5)] data-[size=sm]:[--card-spacing:--spacing(4)] dark:ring-foreground/10" />
```

## Sidebar Layout Pattern

Sidebar ไม่ใช้พื้นหลังสีขาวธรรมดา — เป็นแผงลอย (floating) มุมโค้ง เว้นขอบจากขอบจอ 4 ด้าน ใช้ `glass-panel-primary`:

```tsx
<aside className="fixed left-4 top-4 bottom-4 z-40 hidden w-60 flex-col overflow-hidden rounded-2xl glass-panel-primary md:flex">
```

โครงสร้างภายใน: โลโก้ (icon กล่องขาวมุมโค้ง + ชื่อระบบ 2 บรรทัด) → เส้นแบ่ง `sidebar-border` → nav groups (label ตัวพิมพ์เล็ก uppercase tracking-widest) → เส้นแบ่ง → user block ท้ายสุด (avatar + ชื่อ + role badge + logout).
รายการเมนู active state: พื้นหลัง `bg-sidebar-primary/10`, ตัวหนังสือ `text-sidebar-primary`, จุดกลมเล็กชี้ด้านขวา (`h-1.5 w-1.5 rounded-full bg-sidebar-primary`), ไอคอน Material Symbols สลับเป็น `.fill` เมื่อ active.

Mobile: sidebar พับเป็น `Sheet` (shadcn) เปิดจากปุ่ม hamburger มุมซ้ายบน แทนการแสดงตลอด.

## Buttons (shadcn `cva` variants)

ปุ่มมุมโค้งมาก (`rounded-2xl`), ไม่มี shadow หนัก, active state กดแล้วขยับลง 1px (`active:translate-y-px`):

| variant | ใช้เมื่อ |
|---|---|
| `default` | ปุ่มหลัก — `bg-primary` |
| `outline` | ปุ่มรอง — เส้นขอบ `border-border` |
| `secondary` | ปุ่มรองเบากว่า outline |
| `ghost` | ปุ่มไม่มีพื้นหลัง (โผล่ hover ค่อยเห็น) |
| `destructive` | ลบ/อันตราย — พื้นหลังแดงจาง `bg-destructive/10` (ไม่ใช่แดงเข้ม) |
| `link` | ข้อความล้วนเป็นลิงก์ |

ขนาด: `xs / sm / default / lg` + `icon / icon-xs / icon-sm / icon-lg` (ปุ่มสี่เหลี่ยมจัตุรัสสำหรับไอคอนล้วน)

## Icons

- **Material Symbols Outlined** สำหรับไอคอน UI ทั่วไป (นำทาง, action buttons) — โหลดจาก Google Fonts แบบ variable font, ใช้ผ่าน `<span className="material-symbols-outlined">ชื่อไอคอน</span>`, เพิ่ม class `.fill` เพื่อสลับเป็นตัวเติมทึบ (ใช้ตอน active state)
- **lucide-react** สำหรับไอคอนใน shadcn primitives (dialog close, dropdown chevron ฯลฯ)

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
```

## Scrollbar (custom)

```css
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
```

## Component Inventory (shadcn/ui ที่ติดตั้งไว้แล้ว)

`accordion` `avatar` `badge` `breadcrumb` `button` `card` `chart` `dialog` `dropdown-menu` `input` `progress` `select` `separator` `sheet` `switch` `table` `tabs` `textarea`

บวก custom component ที่ทำเพิ่มเอง: `MetricCard`, `ProgressBar`, `StatusBadge`, `TabNav`, `ComingSoon`

## ขั้นตอนย้ายไปใช้กับเว็บใหม่

1. ติดตั้ง Tailwind v4 + shadcn (`components.json` ตั้ง `style: "radix-rhea"`, `baseColor: "neutral"`, `cssVariables: true`)
2. คัดลอกบล็อก CSS variables (`:root` / `.dark`) ทั้งหมดด้านบน → เปลี่ยนแค่ `--primary`, `--ring`, `--sidebar*`, `--chart-1` เป็นสีองค์กรใหม่ (สีอื่นที่เหลือเป็น neutral มาตรฐาน ใช้ซ้ำได้เลย)
3. คัดลอก `@theme inline` block ทั้งหมด (ไม่ต้องแก้ — เป็นแค่ mapping ตัวแปร→ชื่อ Tailwind)
4. คัดลอก class `.glass-panel`, `.glass-panel-primary`, `.card-shadow`, `.radial-bg`, `.custom-scrollbar` เข้า `globals.css`
5. ติดตั้งฟอนต์ Kanit เป็นฟอนต์หลัก (รองรับภาษาไทย) เหมือนเดิม — เว้นแต่มีฟอนต์องค์กรอื่นกำหนดไว้
6. คัดลอก `Button`, `Card` จาก `components/ui/` ตรง ๆ ได้เลย (ไม่มีโค้ด business logic ปน)
7. Sidebar/TopNav เป็น layout pattern ให้ยึดโครงสร้าง (floating glass sidebar, gradient body) แต่ nav items/routes ต้องเขียนใหม่ตามเว็บนั้น ๆ
