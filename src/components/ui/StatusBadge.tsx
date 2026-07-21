type StatusVariant =
  | "active"
  | "inactive"
  | "pending"
  | "approved"
  | "rejected"
  | "paid"
  | "unpaid"
  | "draft";

const variantStyles: Record<
  StatusVariant,
  { bg: string; text: string; border: string; label: string }
> = {
  active: {
    bg: "bg-[#e6f4ea]",
    text: "text-[#137333]",
    border: "border-[#ceead6]",
    label: "เปิดสอน",
  },
  inactive: {
    bg: "bg-surface-container-high",
    text: "text-on-surface-variant",
    border: "border-outline-variant",
    label: "ปิดรับสมัคร",
  },
  pending: {
    bg: "bg-secondary-container/30",
    text: "text-on-secondary-container",
    border: "border-secondary",
    label: "รอดำเนินการ",
  },
  approved: {
    bg: "bg-[#e6f4ea]",
    text: "text-[#137333]",
    border: "border-[#ceead6]",
    label: "อนุมัติแล้ว",
  },
  rejected: {
    bg: "bg-error-container",
    text: "text-on-error-container",
    border: "border-error",
    label: "ถูกปฏิเสธ",
  },
  paid: {
    bg: "bg-[#e6f4ea]",
    text: "text-[#137333]",
    border: "border-[#ceead6]",
    label: "จ่ายแล้ว",
  },
  unpaid: {
    bg: "bg-error-container",
    text: "text-on-error-container",
    border: "border-error",
    label: "ค้างชำระ",
  },
  draft: {
    bg: "bg-surface-container-high",
    text: "text-on-surface-variant",
    border: "border-outline-variant",
    label: "ฉบับร่าง",
  },
};

export default function StatusBadge({
  variant,
  label,
}: {
  variant: StatusVariant;
  label?: string;
}) {
  const style = variantStyles[variant];
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${style.bg} ${style.text} border ${style.border}`}
    >
      {label || style.label}
    </span>
  );
}
