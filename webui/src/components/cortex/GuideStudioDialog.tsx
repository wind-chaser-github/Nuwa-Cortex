import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CortexPersona } from "@/lib/types";

export type GuideStudioMode = "distill" | "framework" | "recommend" | "update";

export interface GuideStudioSubmit {
  mode: GuideStudioMode;
  message: string;
  personaId: string;
}

interface GuideStudioDialogProps {
  open: boolean;
  mode: GuideStudioMode;
  personas: CortexPersona[];
  initialTargetId?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: GuideStudioSubmit) => void;
}

const STUDIO_PERSONA = "skill-distill";

export function buildStudioMessage(
  mode: GuideStudioMode,
  values: {
    subject: string;
    focus: string;
    need: string;
    targetId: string;
    targetLabel: string;
  },
): string {
  const subject = values.subject.trim();
  const focus = values.focus.trim();
  const need = values.need.trim();
  const label = values.targetLabel.trim() || values.targetId;

  switch (mode) {
    case "distill":
      return focus
        ? `蒸馏 ${subject}，聚焦：${focus}，做一个思维顾问 skill。`
        : `蒸馏 ${subject}，做一个全面的思维顾问 skill。`;
    case "framework":
      return `蒸馏一个「${subject}」主题 skill，面向实际决策场景，综合该领域核心方法论，不要绑定具体人物。`;
    case "recommend":
      return `我的需求：${need}。请帮我诊断并推荐 2-3 个最合适的导师或思维框架，说明匹配理由和局限。`;
    case "update":
      return focus
        ? `更新 ${label} 的 skill。补充说明：${focus}`
        : `更新 ${label} 的 skill，检索最新公开信息并增量刷新心智模型。`;
    default:
      return subject;
  }
}

export function GuideStudioDialog({
  open,
  mode,
  personas,
  initialTargetId,
  onOpenChange,
  onSubmit,
}: GuideStudioDialogProps) {
  const { t } = useTranslation();
  const mentorPersonas = useMemo(
    () => personas.filter((p) => p.kind === "persona"),
    [personas],
  );
  const [subject, setSubject] = useState("");
  const [focus, setFocus] = useState("");
  const [need, setNeed] = useState("");
  const [targetId, setTargetId] = useState(initialTargetId ?? mentorPersonas[0]?.id ?? "");

  const targetLabel =
    mentorPersonas.find((p) => p.id === targetId)?.label ?? targetId;

  useEffect(() => {
    if (open && initialTargetId) setTargetId(initialTargetId);
  }, [open, initialTargetId]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSubject("");
      setFocus("");
      setNeed("");
    } else if (initialTargetId) {
      setTargetId(initialTargetId);
    }
    onOpenChange(next);
  };

  const canSubmit = (() => {
    if (mode === "recommend") return need.trim().length >= 4;
    if (mode === "update") return Boolean(targetId);
    return subject.trim().length >= 1;
  })();

  const handleSubmit = () => {
    if (!canSubmit) return;
    const message = buildStudioMessage(mode, {
      subject,
      focus,
      need,
      targetId,
      targetLabel,
    });
    onSubmit({ mode, message, personaId: STUDIO_PERSONA });
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`cortex.studio.${mode}.title`)}</DialogTitle>
          <DialogDescription>{t(`cortex.studio.${mode}.description`)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {mode === "update" ? (
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted-foreground">{t("cortex.studio.update.target")}</span>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="h-10 w-full rounded-xl border border-border/60 bg-background/70 px-3 text-sm outline-none focus:border-guide-jade/50"
              >
                {mentorPersonas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label || p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {mode === "recommend" ? (
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted-foreground">{t("cortex.studio.recommend.need")}</span>
              <textarea
                value={need}
                onChange={(e) => setNeed(e.target.value)}
                rows={4}
                placeholder={t("cortex.studio.recommend.needPlaceholder")}
                className="w-full rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm outline-none focus:border-guide-jade/50"
              />
            </label>
          ) : (
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted-foreground">
                {t(
                  mode === "framework"
                    ? "cortex.studio.framework.subject"
                    : "cortex.studio.distill.subject",
                )}
              </span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t(
                  mode === "framework"
                    ? "cortex.studio.framework.subjectPlaceholder"
                    : "cortex.studio.distill.subjectPlaceholder",
                )}
                className="h-10 w-full rounded-xl border border-border/60 bg-background/70 px-3 text-sm outline-none focus:border-guide-jade/50"
              />
            </label>
          )}

          {mode === "distill" || mode === "update" ? (
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted-foreground">
                {mode === "update"
                  ? t("cortex.studio.update.notes")
                  : t("cortex.studio.distill.focus")}
              </span>
              <input
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder={t(
                  mode === "update"
                    ? "cortex.studio.update.notesPlaceholder"
                    : "cortex.studio.distill.focusPlaceholder",
                )}
                className="h-10 w-full rounded-xl border border-border/60 bg-background/70 px-3 text-sm outline-none focus:border-guide-jade/50"
              />
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            {t("cortex.studio.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
