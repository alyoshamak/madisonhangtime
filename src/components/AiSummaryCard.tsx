import { Sparkles, Star, Wand2 } from "lucide-react";
import type { AiSummary } from "@/lib/types";
import { relativeTime } from "@/lib/dates";

export const AiSummaryCard = ({ summary }: { summary: AiSummary | null }) => {
  if (!summary || (!summary.summary && !summary.top_recommendation && !summary.unique_pick)) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-serif font-semibold">Activity insights</h2>
        </div>
        <p className="text-muted-foreground">An AI summary will appear here once a few people have submitted.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft space-y-5">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-serif font-semibold">Activity insights</h2>
        </div>
        <span className="text-xs text-muted-foreground">Updated {relativeTime(summary.updated_at)}</span>
      </div>

      {summary.summary && (
        <p className="text-foreground leading-relaxed">{summary.summary}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {summary.top_recommendation && (
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1.5">
              <Star className="h-4 w-4 text-primary" />
              Most popular recommendations
            </div>
            <p className="text-foreground/90 whitespace-pre-line">{summary.top_recommendation}</p>
          </div>
        )}
        {summary.unique_pick && (
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1.5">
              <Wand2 className="h-4 w-4 text-primary" />
              Wildcard pick
            </div>
            <p className="text-foreground/90">{summary.unique_pick}</p>
          </div>
        )}
      </div>
    </div>
  );
};
