import { BookOpen, Download, FolderOpen, MessageSquare, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  addPersonaIngest,
  fetchPersonaDetail,
  runPersonaIngest,
  runPersonaUpgrade,
} from "@/lib/api";
import type { CortexPersonaDetail } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

interface PersonaDetailSheetProps {
  personaId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPersona: (id: string) => void;
  onUpdatePersona: (id: string) => void;
}

function formatTime(iso: string | null | undefined, neverLabel: string): string {
  if (!iso) return neverLabel;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function PersonaDetailSheet({
  personaId,
  open,
  onOpenChange,
  onSelectPersona,
  onUpdatePersona,
}: PersonaDetailSheetProps) {
  const { t } = useTranslation();
  const { token } = useClient();
  const [detail, setDetail] = useState<CortexPersonaDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingestTitle, setIngestTitle] = useState("");
  const [ingestUrl, setIngestUrl] = useState("");
  const [ingestContent, setIngestContent] = useState("");
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!personaId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchPersonaDetail(token, personaId);
      setDetail(payload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [personaId, token]);

  useEffect(() => {
    if (!open || !personaId) return;
    void reload();
  }, [open, personaId, reload]);

  const handleCollect = async () => {
    if (!detail) return;
    setIngestBusy(true);
    setIngestMessage(null);
    try {
      const res = await addPersonaIngest(token, {
        personaId: detail.id,
        title: ingestTitle.trim() || detail.label,
        url: ingestUrl.trim() || undefined,
        content: ingestContent.trim() || undefined,
      });
      const written = Number((res.result as { written?: number }).written ?? 0);
      const skipped = Number((res.result as { skipped?: number }).skipped ?? 0);
      setIngestMessage(t("cortex.ingest.collectOk", { written, skipped }));
      setIngestUrl("");
      setIngestContent("");
      setIngestTitle("");
      await reload();
    } catch (e) {
      setIngestMessage(t("cortex.ingest.collectFailed", { detail: (e as Error).message }));
    } finally {
      setIngestBusy(false);
    }
  };

  const handleRunWatch = async () => {
    if (!detail) return;
    setIngestBusy(true);
    setIngestMessage(null);
    try {
      const res = await runPersonaIngest(token, detail.id);
      const row = res.result as { written?: number; skipped?: number } | undefined;
      const written = row?.written ?? 0;
      const skipped = row?.skipped ?? 0;
      setIngestMessage(t("cortex.ingest.collectOk", { written, skipped }));
      await reload();
    } catch (e) {
      setIngestMessage(t("cortex.ingest.collectFailed", { detail: (e as Error).message }));
    } finally {
      setIngestBusy(false);
    }
  };

  const handleUpgradeNow = async () => {
    if (!detail) return;
    setIngestBusy(true);
    setIngestMessage(null);
    try {
      await runPersonaUpgrade(token, detail.id);
      setIngestMessage(t("cortex.ingest.upgradeStarted"));
    } catch (e) {
      setIngestMessage(t("cortex.ingest.collectFailed", { detail: (e as Error).message }));
    } finally {
      setIngestBusy(false);
    }
  };

  const neverLabel = t("cortex.ingest.never");
  const canCollect = Boolean(ingestUrl.trim() || ingestContent.trim());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full max-w-md overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{detail?.label ?? personaId ?? t("cortex.personaDetail.title")}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {detail?.description ?? t("cortex.personaDetail.loading")}
          </p>
        </SheetHeader>

        {error ? (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        ) : loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("cortex.personaDetail.loading")}</p>
        ) : detail ? (
          <div className="mt-6 space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onSelectPersona(detail.id)}>
                <MessageSquare className="mr-1.5 h-4 w-4" />
                {t("cortex.personaDetail.chat")}
              </Button>
              {detail.kind === "persona" ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => onUpdatePersona(detail.id)}>
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                    {t("cortex.studio.update.short")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ingestBusy}
                    onClick={() => void handleUpgradeNow()}
                  >
                    <Sparkles className="mr-1.5 h-4 w-4" />
                    {t("cortex.ingest.upgradeNow")}
                  </Button>
                </>
              ) : null}
            </div>

            {detail.kind === "persona" && detail.ingest ? (
              <section className="space-y-3 rounded-xl border border-border/50 bg-muted/10 p-3">
                <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Download className="h-3.5 w-3.5" />
                  {t("cortex.ingest.title")}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("cortex.ingest.hint")}
                </p>
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <p>{t("cortex.ingest.lastIngest", { time: formatTime(detail.ingest.last_ingest_at, neverLabel) })}</p>
                  <p>{t("cortex.ingest.lastUpgrade", { time: formatTime(detail.ingest.last_upgrade_at, neverLabel) })}</p>
                  <p>
                    {detail.ingest.pending_upgrade
                      ? t("cortex.ingest.pendingUpgrade")
                      : t("cortex.ingest.noPending")}
                  </p>
                </div>
                <input
                  value={ingestTitle}
                  onChange={(e) => setIngestTitle(e.target.value)}
                  placeholder={t("cortex.ingest.titlePlaceholder")}
                  className="h-9 w-full rounded-lg border border-border/60 bg-background/70 px-3 text-xs outline-none focus:border-guide-jade/50"
                />
                <input
                  value={ingestUrl}
                  onChange={(e) => setIngestUrl(e.target.value)}
                  placeholder={t("cortex.ingest.urlPlaceholder")}
                  className="h-9 w-full rounded-lg border border-border/60 bg-background/70 px-3 text-xs outline-none focus:border-guide-jade/50"
                />
                <textarea
                  value={ingestContent}
                  onChange={(e) => setIngestContent(e.target.value)}
                  rows={3}
                  placeholder={t("cortex.ingest.contentPlaceholder")}
                  className="w-full rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs outline-none focus:border-guide-jade/50"
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={ingestBusy || !canCollect} onClick={() => void handleCollect()}>
                    {t("cortex.ingest.collect")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={ingestBusy} onClick={() => void handleRunWatch()}>
                    {t("cortex.ingest.runWatch")}
                  </Button>
                </div>
                {ingestMessage ? (
                  <p className="text-xs text-muted-foreground">{ingestMessage}</p>
                ) : null}
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("cortex.personaDetail.skillFile")}
              </h3>
              <code className="block break-all rounded-lg bg-muted/50 px-3 py-2 text-[11px]">
                {detail.skill_file}
              </code>
              <p className="text-xs text-muted-foreground">
                {t("cortex.personaDetail.skillLines", { count: detail.skill_lines })}
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                {t("cortex.personaDetail.knowledgeBase")}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("cortex.personaDetail.knowledgeHint")}
              </p>
              {detail.references.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
                  {t("cortex.personaDetail.noReferences")}
                </p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/50 bg-muted/20 p-2 text-xs">
                  {detail.references.map((file) => (
                    <li key={file.path} className="flex items-center justify-between gap-2 px-1 py-0.5">
                      <span className="truncate font-mono">{file.path}</span>
                      <span className="shrink-0 text-muted-foreground">{file.kind}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground">
                {t("cortex.personaDetail.refStats", {
                  total: detail.reference_stats.total,
                  research: detail.reference_stats.research,
                  sources: detail.reference_stats.sources,
                })}
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <FolderOpen className="h-3.5 w-3.5" />
                {t("cortex.personaDetail.personaMemory")}
              </h3>
              <code className="block break-all rounded-lg bg-muted/50 px-3 py-2 text-[11px]">
                {detail.persona_memory_dir}
              </code>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {detail.has_persona_memory_dir
                  ? t("cortex.personaDetail.personaMemoryExists")
                  : t("cortex.personaDetail.personaMemoryEmpty")}
              </p>
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
