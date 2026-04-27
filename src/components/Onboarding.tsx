import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { session } from "@/lib/session";
import type { Member } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export const Onboarding = ({ onDone }: { onDone: () => void }) => {
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("members")
        .select("*")
        .order("name", { ascending: true });
      if (!cancelled) setMembers((data || []) as Member[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pick = (m: Member) => {
    session.setMember(m.id, m.name);
    onDone();
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10 bg-background">
      <div className="w-full max-w-xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-serif font-semibold mb-3">Who are you?</h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
            Tap your name to load your availability.
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-soft">
          {members === null ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No members yet.</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {members.map((m) => (
                <Button
                  key={m.id}
                  variant="outline"
                  className="h-14 text-base justify-start font-medium"
                  onClick={() => pick(m)}
                >
                  {m.name}
                </Button>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Not on the list? Ask the group to add you.
        </p>
      </div>
    </main>
  );
};
