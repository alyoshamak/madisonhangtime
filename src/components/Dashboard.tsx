import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Member, AiSummary } from "@/lib/types";
import { session } from "@/lib/session";
import { relativeTime } from "@/lib/dates";
import { AvailabilityGrid } from "@/components/AvailabilityGrid";
import { OverlapCallout } from "@/components/OverlapCallout";
import { AiSummaryCard } from "@/components/AiSummaryCard";
import { VoiceCapture } from "@/components/VoiceCapture";
import { Button } from "@/components/ui/button";
import { LogOut, Plus } from "lucide-react";
import { toast } from "sonner";

type Props = {
  onSignOut: () => void;
};

export const Dashboard = ({ onSignOut, onAddNew }: Props) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(session.getMemberId());

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

  const claimAs = (id: string, name: string) => {
    session.setMember(id, name);
    setCurrentMemberId(id);
    toast.success(`Welcome back, ${name}`);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-serif font-semibold">QuarterTime</h1>
            <p className="text-muted-foreground mt-1">
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onAddNew}>
              <Plus className="h-4 w-4" />
              Add another friend
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                session.clearPassword();
                session.clearMember();
                onSignOut();
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </header>

        {/* Friends list with last-updated and identity claim */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="text-lg font-semibold mb-4">Who's submitted ({members.length})</h2>
          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-muted-foreground">No responses yet — be the first!</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m) => {
                const isMe = m.id === currentMemberId;
                return (
                  <li
                    key={m.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
                      isMe ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        {m.name}
                        {isMe && <span className="text-[10px] uppercase tracking-wide text-primary font-semibold">you</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">Updated {relativeTime(m.updated_at)}</div>
                    </div>
                    {!currentMemberId && (
                      <Button variant="ghost" size="sm" onClick={() => claimAs(m.id, m.name)}>
                        That's me
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Update / Add controls */}
        {currentMember ? (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="text-sm font-semibold">Update your availability, {currentMember.name}</div>
              <div className="text-sm text-muted-foreground">Tap the mic and tell us what's changed. We'll update your previous responses.</div>
            </div>
            <VoiceCapture
              size="sm"
              claimMemberId={currentMember.id}
              helperText="Tap to update"
            />
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-border bg-card/50 p-5 shadow-soft flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="text-sm font-semibold">Haven't submitted yet?</div>
              <div className="text-sm text-muted-foreground">Tap the mic to record your name, unavailable stretches, and activities you'd enjoy.</div>
            </div>
            <VoiceCapture
              size="sm"
              helperText="Tap to record"
              onSuccess={({ memberId }) => setCurrentMemberId(memberId)}
            />
          </section>
        )}

        {/* Calendar */}
        <section className="space-y-3">
          <h2 className="text-2xl font-serif font-semibold">The next 6 months</h2>
          <AvailabilityGrid members={members} currentMemberId={currentMemberId} />
        </section>

        <OverlapCallout members={members} />

        <AiSummaryCard summary={summary} />

        <footer className="text-center text-xs text-muted-foreground py-6">
          QuarterTime — built for close friends.
        </footer>
      </div>
    </main>
  );
};
