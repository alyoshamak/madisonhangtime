import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceRecorder } from "@/lib/recorder";
import { supabase } from "@/integrations/supabase/client";
import { session } from "@/lib/session";
import { toast } from "sonner";

type Status = "idle" | "recording" | "processing";

export const VoiceCapture = ({
  size = "lg",
  helperText,
  claimMemberId,
  onSuccess,
}: {
  size?: "lg" | "sm";
  helperText?: string;
  claimMemberId?: string;
  onSuccess?: (result: { memberId: string; name: string }) => void;
}) => {
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      recorderRef.current?.cancel();
    };
  }, []);

  const startTimer = () => {
    startedAtRef.current = Date.now();
    setElapsed(0);
    tickRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 250);
  };
  const stopTimer = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
  };

  const begin = async () => {
    try {
      const r = new VoiceRecorder();
      await r.start();
      recorderRef.current = r;
      setStatus("recording");
      startTimer();
    } catch (e) {
      console.error(e);
      toast.error("Couldn't access your microphone.");
    }
  };

  const finish = async () => {
    if (!recorderRef.current) return;
    stopTimer();
    setStatus("processing");
    try {
      const rec = await recorderRef.current.stop();
      recorderRef.current = null;
      const password = session.getPassword();
      if (!password) {
        toast.error("Session expired, please re-enter the password.");
        setStatus("idle");
        return;
      }
      const { data, error } = await supabase.functions.invoke("submit-voice", {
        body: {
          password,
          audioBase64: rec.base64,
          mimeType: rec.mimeType,
          claimMemberId,
        },
      });
      if (error) {
        const msg = (error as any)?.message || "Saving failed.";
        toast.error(msg);
        setStatus("idle");
        return;
      }
      if (!data?.ok) {
        toast.error(data?.error || "Saving failed.");
        setStatus("idle");
        return;
      }
      session.setMember(data.memberId, data.name);
      toast.success(`Saved — welcome, ${data.name}`);
      onSuccess?.({ memberId: data.memberId, name: data.name });
      setStatus("idle");
    } catch (e) {
      console.error(e);
      toast.error("Something went wrong while saving.");
      setStatus("idle");
    }
  };

  const isLg = size === "lg";
  const buttonSize = isLg ? "h-28 w-28" : "h-11 w-11";
  const iconSize = isLg ? "h-10 w-10" : "h-5 w-5";

  return (
    <div className={cn("flex", isLg ? "flex-col items-center gap-6" : "flex-row items-center gap-3")}>
      <button
        type="button"
        onClick={status === "idle" ? begin : status === "recording" ? finish : undefined}
        disabled={status === "processing"}
        aria-label={status === "recording" ? "Stop recording" : "Start recording"}
        className={cn(
          "relative rounded-full flex items-center justify-center transition-all",
          "focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30",
          buttonSize,
          status === "idle" && "bg-primary text-primary-foreground hover:bg-primary/90 mic-pulse shadow-soft",
          status === "recording" && "bg-destructive text-destructive-foreground recording-pulse shadow-soft",
          status === "processing" && "bg-muted text-muted-foreground cursor-wait",
        )}
      >
        {status === "processing" ? (
          <Loader2 className={cn(iconSize, "animate-spin")} />
        ) : status === "recording" ? (
          <Square className={cn(iconSize, "fill-current")} />
        ) : (
          <Mic className={iconSize} />
        )}
      </button>
      {isLg && (
        <div className="text-center max-w-md">
          {status === "recording" ? (
            <p className="text-base font-medium text-foreground">
              Recording… {elapsed}s
              <span className="block text-sm text-muted-foreground mt-1">Tap the square when you're done.</span>
            </p>
          ) : status === "processing" ? (
            <p className="text-base font-medium text-foreground">Saving your response…</p>
          ) : (
            helperText && <p className="text-base text-muted-foreground leading-relaxed">{helperText}</p>
          )}
        </div>
      )}
      {!isLg && (
        <div className="text-sm text-muted-foreground">
          {status === "recording" ? `Recording ${elapsed}s — tap to stop` : status === "processing" ? "Saving…" : helperText}
        </div>
      )}
    </div>
  );
};
