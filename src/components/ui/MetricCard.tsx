type MetricCardProps = {
  icon: string;
  label: string;
  value: string;
  variant?: "default" | "error" | "success";
  accentBorder?: boolean;
};

export default function MetricCard({
  icon,
  label,
  value,
  variant = "default",
  accentBorder = false,
}: MetricCardProps) {
  const borderClass =
    variant === "error" && accentBorder
      ? "border-l-4 border-l-error"
      : variant === "success" && accentBorder
        ? "border-l-4 border-l-[#137333]"
        : "";

  const iconBg =
    variant === "error"
      ? "bg-error-container"
      : variant === "success"
        ? "bg-[#e6f4ea]"
        : "bg-surface-container-low";

  const iconColor =
    variant === "error"
      ? "text-on-error-container"
      : variant === "success"
        ? "text-[#137333]"
        : "text-primary";

  const valueColor =
    variant === "error"
      ? "text-error"
      : variant === "success"
        ? "text-[#137333]"
        : "text-on-surface";

  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-6 md:p-8 card-shadow border border-outline-variant ${borderClass}`}
    >
      <div className="flex items-center gap-5">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center ${iconBg}`}
        >
          <span className={`material-symbols-outlined text-2xl ${iconColor}`}>
            {icon}
          </span>
        </div>
        <div>
          <h2 className="text-sm font-medium text-on-surface-variant mb-1">
            {label}
          </h2>
          <div className={`text-3xl md:text-4xl font-bold ${valueColor}`}>
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}
