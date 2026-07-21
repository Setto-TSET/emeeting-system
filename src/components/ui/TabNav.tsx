"use client";

type Tab = {
  key: string;
  label: string;
  count?: number;
  disabled?: boolean;
};

type TabNavProps = {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
};

export default function TabNav({ tabs, activeTab, onTabChange }: TabNavProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-outline-variant">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => !tab.disabled && onTabChange(tab.key)}
          disabled={tab.disabled}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === tab.key
              ? "border-primary text-primary"
              : "border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant"
          } ${tab.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
                activeTab === tab.key
                  ? "bg-primary-container/20 text-primary"
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
