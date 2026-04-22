import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { session } from "@/lib/session";
import { toast } from "sonner";

export const PasswordGate = ({ onUnlock }: { onUnlock: () => void }) => {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-password", {
        body: { password: password.trim() },
      });
      if (error || !data?.ok) {
        toast.error("That password didn't work.");
        return;
      }
      session.setPassword(password.trim());
      onUnlock();
    } catch (err) {
      toast.error("Couldn't verify right now. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-serif font-semibold mb-3">HangTime</h1>
          <p className="text-muted-foreground">A place to find time for the boys to be boys.</p>
        </div>
        <form onSubmit={submit} className="bg-card border border-border rounded-2xl p-6 shadow-soft space-y-4">
          <label htmlFor="pw" className="block text-sm font-medium">
            Enter the group password
          </label>
          <Input
            id="pw"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="h-12 text-base"
          />
          <Button type="submit" disabled={busy} className="w-full h-12 text-base">
            {busy ? "Checking…" : "Enter"}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-6">For close friends only.</p>
      </div>
    </main>
  );
};
