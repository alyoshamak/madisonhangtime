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
      // If this device already submitted, skip onboarding and go straight to the dashboard.
      const memberId = session.getMemberId();
      if (memberId) {
        const { data } = await supabase.from("members").select("id").eq("id", memberId).maybeSingle();
        if (data) {
          setStage("dashboard");
          return;
        }
        // Member was deleted upstream — clear stale identity and fall through.
        session.clearMember();
      }
      // No identity on this device yet — show the onboarding/record flow.
      setStage("onboarding");
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
