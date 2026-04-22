import { useEffect, useState } from "react";
import { VoiceCapture } from "./VoiceCapture";
import { supabase } from "@/integrations/supabase/client";
import { session } from "@/lib/session";
import { Button } from "@/components/ui/button";
import type { Member } from "@/lib/types";

export const Onboarding = ({ onDone }: { onDone: () => void }) => {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("members")
        .select("*")
        .order("created_at", { ascending: true });
      if (!cancelled && data) setMembers(data as Member[]);
    })();
    return () => { cancelled = true; };
  }, []);

  const claimAs = (id: string, name: string) => {
    session.setMember(id, name);
    onDone();
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10 bg-background">
      <div className="w-full max-w-xl text-center">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-serif font-semibold mb-4">Let's hear from you</h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
            Tap the mic and tell us three things in your own words.
          </p>
        </div>

        <ul className="text-left space-y-3 mb-12 max-w-md mx-auto">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">1</span>
            <span className="text-foreground">Your name</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">2</span>
            <span className="text-foreground">
              The stretches of days you are <strong className="font-bold text-primary uppercase tracking-wide">not</strong> available over the next 6 months
              <span className="block text-sm text-muted-foreground mt-1">You can edit this later on.</span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">3</span>
            <span className="text-foreground">Activities you'd love to do together</span>
          </li>
        </ul>

        <VoiceCapture
          size="lg"
          helperText="Tap the mic to start, tap again to finish. We'll handle the rest."
          onSuccess={() => onDone()}
        />

        {members.length > 0 && (
          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground mb-3">
              Already submitted from another device? Pick your name to jump in:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {members.map((m) => (
                <Button key={m.id} variant="outline" size="sm" onClick={() => claimAs(m.id, m.name)}>
                  I'm {m.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
};
