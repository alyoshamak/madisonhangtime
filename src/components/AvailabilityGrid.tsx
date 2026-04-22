import { useMemo, useRef, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  addDays,
  generateDays,
  isUnavailable,
  prettyDate,
  shortMonth,
  startOfDay,
  ymd,
} from "@/lib/dates";
import type { Member } from "@/lib/types";
import { cn } from "@/lib/utils";

const DAY_WIDTH = 18;       // px per day cell
const ROW_HEIGHT = 36;      // px per member row
const NAME_COL_WIDTH = 140; // px

type Props = {
  members: Member[];
  currentMemberId?: string | null;
  daysCount?: number; // default ~ 6 months
};

export const AvailabilityGrid = ({ members, currentMemberId, daysCount = 183 }: Props) => {
  const today = startOfDay(new Date());
  const days = useMemo(() => generateDays(today, daysCount), [today.getTime(), daysCount]);

  // For each day, true if every submitted member is available
  const overlapDays = useMemo(() => {
    if (members.length === 0) return new Set<string>();
    const out = new Set<string>();
    for (const d of days) {
      const allFree = members.every((m) => !isUnavailable(d, m.unavailable_ranges));
      if (allFree) out.add(ymd(d));
    }
    return out;
  }, [days, members]);

  // Month header segments
  const monthSegments = useMemo(() => {
    const segs: { label: string; start: number; width: number }[] = [];
    let i = 0;
    while (i < days.length) {
      const m = days[i].getMonth();
      const y = days[i].getFullYear();
      let j = i;
      while (j < days.length && days[j].getMonth() === m && days[j].getFullYear() === y) j++;
      segs.push({
        label: `${shortMonth(days[i])} ${days[i].getFullYear()}`,
        start: i,
        width: j - i,
      });
      i = j;
    }
    return segs;
  }, [days]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll near today on first mount (already at start, but ensure)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, []);

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground shadow-soft">
        No responses yet. Once friends submit, the calendar fills in here.
      </div>
    );
  }

  const totalWidth = days.length * DAY_WIDTH;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-soft">
        <div className="flex">
          {/* Sticky names column */}
          <div className="shrink-0 border-r border-border bg-card" style={{ width: NAME_COL_WIDTH }}>
            <div style={{ height: 56 }} className="border-b border-border flex items-end px-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Friends
            </div>
            {members.map((m) => (
              <div
                key={m.id}
                style={{ height: ROW_HEIGHT }}
                className={cn(
                  "flex items-center px-4 text-sm border-b border-border/60 truncate",
                  m.id === currentMemberId && "bg-primary/5 font-semibold",
                )}
                title={m.name}
              >
                {m.name}
              </div>
            ))}
          </div>

          {/* Scrollable grid */}
          <div ref={scrollRef} className="flex-1 overflow-x-auto">
            <div style={{ width: totalWidth, position: "relative" }}>
              {/* Month header */}
              <div className="flex border-b border-border" style={{ height: 28 }}>
                {monthSegments.map((seg, i) => (
                  <div
                    key={i}
                    className="text-xs font-medium text-muted-foreground border-r border-border/40 flex items-center px-2 truncate"
                    style={{ width: seg.width * DAY_WIDTH }}
                  >
                    {seg.label}
                  </div>
                ))}
              </div>
              {/* Day-of-month row */}
              <div className="flex border-b border-border" style={{ height: 28 }}>
                {days.map((d, i) => {
                  const isToday = i === 0;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isOverlap = overlapDays.has(ymd(d));
                  return (
                    <div
                      key={i}
                      className={cn(
                        "text-[10px] flex items-center justify-center border-r border-border/30",
                        isWeekend ? "text-muted-foreground/80 bg-muted/30" : "text-muted-foreground",
                        isOverlap && "text-foreground font-semibold",
                      )}
                      style={{ width: DAY_WIDTH }}
                    >
                      {d.getDate()}
                    </div>
                  );
                })}
              </div>

              {/* Member rows */}
              <div className="relative">
                {/* Gold overlap bars (absolute, span full height of all rows) */}
                {[...overlapDays].map((key) => {
                  const idx = days.findIndex((d) => ymd(d) === key);
                  if (idx < 0) return null;
                  const date = days[idx];
                  return (
                    <Tooltip key={key}>
                      <TooltipTrigger asChild>
                        <div
                          className="absolute top-0 gold-bar pointer-events-auto cursor-help"
                          style={{
                            left: idx * DAY_WIDTH,
                            width: DAY_WIDTH,
                            height: members.length * ROW_HEIGHT,
                          }}
                          aria-label={`Everyone free — ${prettyDate(date)}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <span className="font-medium">Everyone free</span> — {prettyDate(date)}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}

                {/* Today marker line */}
                <div
                  className="absolute top-0 w-px bg-primary/70 z-10 pointer-events-none"
                  style={{ left: 0, height: members.length * ROW_HEIGHT }}
                />

                {members.map((m) => (
                  <div key={m.id} className="flex border-b border-border/60" style={{ height: ROW_HEIGHT }}>
                    {days.map((d, i) => {
                      const busy = isUnavailable(d, m.unavailable_ranges);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "border-r border-background/60",
                            busy ? "bg-avail-busy" : "bg-avail-free",
                            isWeekend && "opacity-90",
                          )}
                          style={{ width: DAY_WIDTH }}
                          title={`${m.name} — ${prettyDate(d)}: ${busy ? "Unavailable" : "Available"}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 px-4 py-3 border-t border-border bg-muted/30 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-avail-free" /> Available</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-avail-busy" /> Unavailable</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm gold-bar" /> Everyone free</span>
          <span className="ml-auto">Scroll horizontally to see all 6 months →</span>
        </div>
      </div>
    </TooltipProvider>
  );
};
