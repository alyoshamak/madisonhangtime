import { VoiceCapture } from "./VoiceCapture";

export const Onboarding = ({ onDone }: { onDone: () => void }) => {

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

      </div>
    </main>
  );
};
