import { Loader2, Sparkles, Wrench, PenLine } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { TurnPhase } from "@/lib/turn-status";

interface CortexTurnProgressProps {
  phase: TurnPhase;
  detail?: string;
}

const ICONS: Record<Exclude<TurnPhase, "idle">, typeof Loader2> = {
  waiting: Loader2,
  thinking: Sparkles,
  tools: Wrench,
  writing: PenLine,
};

export function CortexTurnProgress({ phase, detail }: CortexTurnProgressProps) {
  const { t } = useTranslation();
  if (phase === "idle") return null;

  const Icon = ICONS[phase];
  const label = t(`cortex.progress.${phase}`);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mx-4 mb-2 flex items-center gap-3 rounded-2xl border border-guide-jade/25",
        "bg-guide-jade/8 px-4 py-2.5 text-sm shadow-sm backdrop-blur-sm",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 text-guide-jade",
          (phase === "waiting" || phase === "writing") && "animate-spin",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{label}</p>
        {detail ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
        ) : null}
      </div>
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-guide-jade/40" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-guide-jade" />
      </span>
    </div>
  );
}
