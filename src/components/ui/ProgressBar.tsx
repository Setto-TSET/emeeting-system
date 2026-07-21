type ProgressBarProps = {
  label: string;
  value: number; // 0-100
};

export default function ProgressBar({ label, value }: ProgressBarProps) {
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span className="text-sm text-on-surface">{label}</span>
        <span className="text-sm font-medium text-primary">{value}%</span>
      </div>
      <div className="w-full bg-surface-container-high rounded-full h-2.5">
        <div
          className="bg-primary-container h-2.5 rounded-full transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
