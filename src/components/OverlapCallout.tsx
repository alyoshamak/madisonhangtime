import { useMemo } from "react";
import { generateDays, isUnavailable, prettyDate, startOfDay, ymd } from "@/lib/dates";
import type { Member } from "@/lib/types";

export const OverlapCallout = ({ members, daysCount = 183, max = 8 }: { members: Member[]; daysCount?: number; max?: number }) => {
  const today = startOfDay(new Date());
  const overlaps = useMemo(() => {
    if (members.length === 0) return [];
    const out: Date[] = [];
    const days = generateDays(today, daysCount);
    for (const d of days) {
      if (members.every((m) => !isUnavailable(d, m.unavailable_ranges))) {
        out.push(d);
        if (out.length >= max) break;
      }
    }
    return out;
  }, [members, today.getTime(), daysCount, max]);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-2xl font-serif font-semibold">Days everyone is free</h2>
        <span className="text-xs text-muted-foreground">Next {max} matches</span>
      </div>
      {members.length === 0 ? (
        <p className="text-muted-foreground">Once friends submit, overlap days appear here.</p>
      ) : overlaps.length === 0 ? (
        <p className="text-muted-foreground">No fully overlapping days yet — more responses needed.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {overlaps.map((d) => (
            <div
              key={ymd(d)}
              className="gold-bar rounded-xl px-4 py-3 text-sm font-medium text-foreground"
              style={{ minWidth: 140 }}
            >
              {prettyDate(d)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
