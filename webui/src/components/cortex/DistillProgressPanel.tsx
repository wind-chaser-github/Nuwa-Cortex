import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export const DISTILL_PHASES = [
  "clarify",
  "setup",
  "research",
  "extract",
  "write",
  "qa",
] as const;

export type DistillPhaseId = (typeof DISTILL_PHASES)[number];

export interface StudioJobState {
  key: number;
  mode: string;
  subject: string;
  phaseIndex: number;
  completed: boolean;
}

interface DistillProgressPanelProps {
  job: StudioJobState | null;
  onDismiss?: () => void;
}

export function DistillProgressPanel({ job, onDismiss }: DistillProgressPanelProps) {
  const { t } = useTranslation();
  if (!job || job.completed) return null;

  return (
    <div className="border-b border-guide-jade/20 bg-guide-jade/5 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-guide-jade">
          {t("cortex.distillProgress.title", { subject: job.subject || t("cortex.studio.distill.short") })}
        </p>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            {t("common.dismiss")}
          </button>
        ) : null}
      </div>
      <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {DISTILL_PHASES.map((phaseId, index) => {
          const done = index < job.phaseIndex;
          const active = index === job.phaseIndex;
          const Icon = done ? CheckCircle2 : active ? Loader2 : Circle;
          return (
            <li
              key={phaseId}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px]",
                active && "bg-background/70 text-guide-jade",
                done && "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0", active && "animate-spin")} />
              <span>{t(`cortex.distillProgress.phases.${phaseId}`)}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {t("cortex.distillProgress.hint")}
      </p>
    </div>
  );
}

export function advanceStudioJob(job: StudioJobState): StudioJobState {
  if (job.completed) return job;
  const next = job.phaseIndex + 1;
  if (next >= DISTILL_PHASES.length) {
    return { ...job, phaseIndex: DISTILL_PHASES.length - 1, completed: true };
  }
  return { ...job, phaseIndex: next };
}
