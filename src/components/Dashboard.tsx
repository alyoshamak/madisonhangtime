import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Member, AiSummary } from "@/lib/types";
import { session } from "@/lib/session";
import { AvailabilityGrid } from "@/components/AvailabilityGrid";
import { OverlapCallout } from "@/components/OverlapCallout";
import { AiSummaryCard } from "@/components/AiSummaryCard";
import { VoiceCapture } from "@/components/VoiceCapture";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

type Props = {
  onSignOut: () => void;
};

export const Dashboard = ({ onSignOut }: Props) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMemberId] = useState<string | null>(session.getMemberId());

  const load = async () => {
    const [m, s] = await Promise.all([
      supabase.from("members").select("*").order("created_at", { ascending: true }),
      supabase.from("ai_summary_cache").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (m.error) {
      console.error(m.error);
      toast.error("Couldn't load friends.");
    } else {
      setMembers((m.data || []) as Member[]);
    }
    if (s.data) setSummary(s.data as AiSummary);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_summary_cache" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentMember = members.find((m) => m.id === currentMemberId) || null;

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-serif font-semibold">HangTime</h1>
            <p className="text-muted-foreground mt-1">
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                session.clearPassword();
                // Keep memberId so this device is recognized on next sign-in.
                onSignOut();
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </header>

        {/* Voice update card — optional alternative to tapping the grid */}
        {currentMember && (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="text-sm font-semibold">Update availability and activity preferences, {currentMember.name}</div>
              <div className="text-sm text-muted-foreground">Prefer to talk? Tap the mic and tell us what's changed — we'll update your previous responses.</div>
            </div>
            <VoiceCapture
              size="sm"
              claimMemberId={currentMember.id}
              helperText="Tap to update"
            />
          </section>
        )}

        {/* Calendar */}
        <section className="space-y-3">
          <h2 className="text-2xl font-serif font-semibold">The next 6 months</h2>
          {currentMember && (
            <p className="text-base text-foreground/80">
              👇 Tap the dates next to <span className="font-semibold">{currentMember.name}</span> that you're <strong>not</strong> available. Or use the mic above to speak your updates.
            </p>
          )}
          <AvailabilityGrid members={members} currentMemberId={currentMemberId} />
        </section>

        <OverlapCallout members={members} />

        <AiSummaryCard summary={summary} />

        <footer className="text-center text-xs text-muted-foreground py-6">
          HangTime — built for close friends.
        </footer>
      </div>
    </main>
  );
};
