import { useEffect, useState } from "react";
import { PasswordGate } from "@/components/PasswordGate";
import { Onboarding } from "@/components/Onboarding";
import { Dashboard } from "@/components/Dashboard";
import { session } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";

type Stage = "loading" | "gate" | "onboarding" | "dashboard";

const Index = () => {
  const [stage, setStage] = useState<Stage>("loading");

  useEffect(() => {
    const init = async () => {
      const pw = session.getPassword();
      if (!pw) {
        setStage("gate");
        return;
      }
      // If they have a password but no claimed identity, check whether anyone has submitted yet.
      const memberId = session.getMemberId();
      if (memberId) {
        // Verify the member still exists
        const { data } = await supabase.from("members").select("id").eq("id", memberId).maybeSingle();
        if (data) {
          setStage("dashboard");
          return;
        }
        session.clearMember();
      }
      // No identity yet — show onboarding only if they're literally the first / haven't submitted.
      // But others may have already submitted, so still go to dashboard with "claim" flow available.
      const { count } = await supabase.from("members").select("*", { count: "exact", head: true });
      setStage((count ?? 0) === 0 ? "onboarding" : "dashboard");
    };
    init();
  }, []);

  if (stage === "loading") {
    return <main className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Loading…</main>;
  }
  if (stage === "gate") {
    return <PasswordGate onUnlock={async () => {
      const { count } = await supabase.from("members").select("*", { count: "exact", head: true });
      setStage((count ?? 0) === 0 ? "onboarding" : "dashboard");
    }} />;
  }
  if (stage === "onboarding") {
    return <Onboarding onDone={() => setStage("dashboard")} />;
  }
  return <Dashboard onSignOut={() => setStage("gate")} />;
};

export default Index;
