import type { DayInfo, DayStatus } from "@/domain/calendar";
import { weekdayOf } from "@/domain/dates";

const STYLE: Record<DayStatus, { cls: string; mark: string; label: string }> = {
  achieved: { cls: "bg-amber-400 text-white", mark: "⭐", label: "たっせい" },
  special: { cls: "bg-violet-200 text-violet-900", mark: "🌙", label: "とくべつ休み" },
  ticket: { cls: "bg-sky-200 text-sky-900", mark: "🎫", label: "おやすみけん" },
  missed: { cls: "bg-gray-400 text-white", mark: "✕", label: "みたっせい" },
  today: { cls: "bg-white ring-4 ring-amber-400 text-gray-900", mark: "", label: "きょう" },
  future: { cls: "bg-white text-gray-400", mark: "", label: "" },
  out_of_range: { cls: "bg-transparent text-gray-300", mark: "", label: "" },
};

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

export function MonthCalendar({ days, compact = false }: { days: DayInfo[]; compact?: boolean }) {
  const first = days[0];
  const pad = first ? weekdayOf(first.date) : 0;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-gray-500">
        {WEEK.map((w, i) => (
          <div key={w} className={i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}>
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" data-testid="calendar">
        {Array.from({ length: pad }, (_, i) => (
          <div key={`p${i}`} />
        ))}
        {days.map((d) => {
          const st = STYLE[d.status];
          return (
            <div
              key={d.date}
              data-date={d.date}
              data-status={d.status}
              title={st.label}
              className={`flex ${compact ? "h-10" : "h-12"} flex-col items-center justify-center rounded-lg text-sm font-bold ${st.cls}`}
            >
              <span className="leading-none">{Number(d.date.slice(8))}</span>
              {st.mark && <span className="text-[10px] leading-none">{st.mark}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
        {(["achieved", "ticket", "special", "missed"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded ${STYLE[s].cls}`} />
            {STYLE[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}
