import { useMemo, useRef, useEffect, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  generateDays,
  isUnavailable,
  prettyDate,
  relativeTime,
  shortMonth,
  startOfDay,
  ymd,
} from "@/lib/dates";
import type { Member, UnavailableRange } from "@/lib/types";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { session } from "@/lib/session";
import { toast } from "sonner";

const DAY_WIDTH = 18;       // px per day cell
const ROW_HEIGHT = 44;      // px per member row
const NAME_COL_WIDTH = 170; // px

type Props = {
  members: Member[];
  currentMemberId?: string | null;
  daysCount?: number; // default ~ 6 months
};

export const AvailabilityGrid = ({ members, currentMemberId, daysCount = 183 }: Props) => {
  const today = startOfDay(new Date());
  const days = useMemo(() => generateDays(today, daysCount), [today.getTime(), daysCount]);

  // Local optimistic overrides for the current member's ranges, keyed by member id.
  const [override, setOverride] = useState<Record<string, UnavailableRange[]>>({});
  const [pendingDays, setPendingDays] = useState<Set<string>>(new Set());

  // Clear override for a member when their server data changes (i.e. fresh load came in).
  // We compare by updated_at via a stringified key.
  useEffect(() => {
    setOverride((prev) => {
      if (!Object.keys(prev).length) return prev;
      const next = { ...prev };
      let changed = false;
      for (const m of members) {
        if (next[m.id]) {
          delete next[m.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // Only when members array reference changes (parent re-fetches via realtime)
  }, [members]);

  const effectiveRanges = (m: Member): UnavailableRange[] =>
    override[m.id] ?? (m.unavailable_ranges as UnavailableRange[]);

  // For each day, true if every submitted member is available
  const overlapDays = useMemo(() => {
    if (members.length === 0) return new Set<string>();
    const out = new Set<string>();
    for (const d of days) {
      const allFree = members.every((m) => !isUnavailable(d, effectiveRanges(m)));
      if (allFree) out.add(ymd(d));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, members, override]);

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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, []);

  const toggleDay = async (member: Member, date: Date) => {
    const password = session.getPassword();
    if (!password) {
      toast.error("Session expired. Please sign in again.");
      return;
    }
    const dayKey = ymd(date);
    const pendKey = `${member.id}:${dayKey}`;
    if (pendingDays.has(pendKey)) return;

    const current = effectiveRanges(member);
    const wasBusy = isUnavailable(date, current);

    // Optimistic update
    let nextRanges: UnavailableRange[];
    if (wasBusy) {
      // Remove the day from any range that covers it
      nextRanges = current.flatMap((r) => {
        const s = r.start_date;
        const e = r.end_date;
        if (dayKey < s || dayKey > e) return [r];
        const out: UnavailableRange[] = [];
        if (s < dayKey) {
          const prevDay = new Date(date);
          prevDay.setDate(prevDay.getDate() - 1);
          out.push({ start_date: s, end_date: ymd(prevDay), label: r.label ?? null });
        }
        if (dayKey < e) {
          const nextDay = new Date(date);
          nextDay.setDate(nextDay.getDate() + 1);
          out.push({ start_date: ymd(nextDay), end_date: e, label: r.label ?? null });
        }
        return out;
      });
    } else {
      nextRanges = [...current, { start_date: dayKey, end_date: dayKey, label: null }];
    }

    setOverride((p) => ({ ...p, [member.id]: nextRanges }));
    setPendingDays((p) => {
      const n = new Set(p);
      n.add(pendKey);
      return n;
    });

    try {
      const { data, error } = await supabase.functions.invoke("toggle-day", {
        body: { password, member_id: member.id, date: dayKey },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Toggle failed");
      }
    } catch (e: any) {
      // Revert
      setOverride((p) => {
        const n = { ...p };
        delete n[member.id];
        return n;
      });
      toast.error(e?.message || "Couldn't update that day.");
    } finally {
      setPendingDays((p) => {
        const n = new Set(p);
        n.delete(pendKey);
        return n;
      });
    }
  };

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
            {members.map((m) => {
              const hasEntered = m.updated_at !== m.created_at;
              return (
                <div
                  key={m.id}
                  style={{ height: ROW_HEIGHT }}
                  className={cn(
                    "flex flex-col justify-center px-4 border-b border-border/60 truncate",
                    m.id === currentMemberId && "bg-primary/5",
                  )}
                  title={hasEntered ? `${m.name} — updated ${relativeTime(m.updated_at)}` : `${m.name} — hasn't entered availability yet`}
                >
                  <div className={cn("text-sm truncate leading-tight", m.id === currentMemberId && "font-semibold")}>
                    {m.name}
                  </div>
                  <div className={cn("text-[10px] leading-tight", hasEntered ? "text-muted-foreground" : "text-muted-foreground/70 italic")}>
                    {hasEntered ? `Updated ${relativeTime(m.updated_at)}` : "Not entered yet"}
                  </div>
                </div>
              );
            })}
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
                          className="absolute top-0 gold-bar pointer-events-none z-[5]"
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

                {members.map((m) => {
                  const isCurrent = m.id === currentMemberId;
                  const ranges = effectiveRanges(m);
                  return (
                    <div key={m.id} className="flex border-b border-border/60" style={{ height: ROW_HEIGHT }}>
                      {days.map((d, i) => {
                        const busy = isUnavailable(d, ranges);
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        const dayKey = ymd(d);
                        const pendKey = `${m.id}:${dayKey}`;
                        const isPending = pendingDays.has(pendKey);

                        if (isCurrent) {
                          return (
                            <button
                              key={i}
                              type="button"
                              disabled={isPending}
                              onClick={() => toggleDay(m, d)}
                              className={cn(
                                "border-r border-background/60 transition-opacity hover:opacity-80 cursor-pointer relative z-[1]",
                                busy ? "bg-avail-busy" : "bg-avail-free",
                                isWeekend && "opacity-90",
                                isPending && "animate-pulse",
                              )}
                              style={{ width: DAY_WIDTH }}
                              title={`${m.name} — ${prettyDate(d)}: ${busy ? "Unavailable" : "Available"} (click to toggle)`}
                              aria-label={`Toggle ${prettyDate(d)} availability`}
                            />
                          );
                        }

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
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 px-4 py-3 border-t border-border bg-muted/30 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-avail-free" /> Available</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-avail-busy" /> Unavailable</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm gold-bar" /> Everyone free</span>
          {currentMemberId && (
            <span className="text-foreground/80 font-medium">👆 Tap any day in your row to flip green ↔ red.</span>
          )}
          <span className="ml-auto">Scroll horizontally to see all 6 months →</span>
        </div>
      </div>
    </TooltipProvider>
  );
};
