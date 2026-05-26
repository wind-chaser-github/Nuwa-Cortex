import { Database, Plus, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { CortexDashboard } from "@/lib/types";
import { MemoryExplainer } from "@/components/cortex/MemoryExplainer";

interface MemorySynapsePanelProps {
  dashboard: CortexDashboard | null;
  loading?: boolean;
  error?: string | null;
  onRefresh: () => void;
  onSearch: (query: string) => void;
  onAddMemory?: () => void;
  className?: string;
}

export function MemorySynapsePanel({
  dashboard,
  loading = false,
  error = null,
  onRefresh,
  onSearch,
  onAddMemory,
  className,
}: MemorySynapsePanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"chunks" | "guide">("chunks");

  const memoryTree = dashboard?.memory.memory_tree;
  const chunks = dashboard?.memory.chunks ?? [];
  const workspacePath = memoryTree?.workspace ?? "~/.guide_cortex/workspace";
  const contentPath = memoryTree?.content_path ?? `${workspacePath}/memory_tree/content`;

  return (
    <aside
      className={cn(
        "cortex-synapse flex h-full shrink-0 flex-col border-l border-border/50 bg-card/20",
        className ?? "w-[min(360px,34vw)]",
      )}
    >
      <div className="border-b border-border/40 px-4 py-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-guide-amber/90">
          {t("cortex.memory.eyebrow")}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {t("cortex.memory.title")}
          </h2>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label={t("cortex.memory.refresh")}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          {onAddMemory ? (
            <button
              type="button"
              onClick={onAddMemory}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-guide-jade"
              aria-label={t("cortex.memory.addTitle")}
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-3 text-xs leading-relaxed text-destructive">
          {t("cortex.memory.apiError", { detail: error })}
        </div>
      ) : null}

      <div className="flex border-b border-border/30 px-4 pt-2">
        <button
          type="button"
          onClick={() => setTab("chunks")}
          className={cn(
            "border-b-2 px-3 py-2 text-xs font-medium transition-colors",
            tab === "chunks"
              ? "border-guide-jade text-guide-jade"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t("cortex.memory.tabChunks")}
        </button>
        <button
          type="button"
          onClick={() => setTab("guide")}
          className={cn(
            "border-b-2 px-3 py-2 text-xs font-medium transition-colors",
            tab === "guide"
              ? "border-guide-jade text-guide-jade"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t("cortex.memory.tabGuide")}
        </button>
      </div>

      {tab === "guide" ? (
        <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
          <MemoryExplainer guide={dashboard?.memory_guide} />
        </div>
      ) : (
        <>
      <div className="border-b border-border/30 px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch(query);
            }}
            placeholder={t("cortex.memory.searchPlaceholder")}
            className="h-10 w-full rounded-xl border border-border/60 bg-background/60 pl-9 pr-3 text-sm outline-none ring-guide-jade/30 transition focus:border-guide-jade/50 focus:ring-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-border/30 px-4 py-3 text-xs">
        <StatusChip
          label={t("cortex.memory.title")}
          value={
            memoryTree?.state === "ready"
              ? t("cortex.memory.connected", { count: memoryTree.file_count ?? memoryTree.chunk_count })
              : memoryTree?.message ?? t("cortex.memory.disconnected")
          }
          tone={memoryTree?.state === "ready" ? "jade" : "muted"}
        />
        <StatusChip
          label={t("cortex.memory.localInbox")}
          value={t("cortex.memory.chunkCount", {
            count: dashboard?.memory.local_inbox.chunk_count ?? 0,
          })}
          tone="amber"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
        {!memoryTree?.connected && memoryTree?.enabled !== false ? (
          <div className="mb-4 rounded-2xl border border-guide-amber/25 bg-guide-amber/5 p-3 text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-guide-amber">{t("cortex.memory.memorySetupTitle")}</p>
            <p className="mt-2">{memoryTree?.message ?? t("cortex.memory.memorySetupHint")}</p>
            {memoryTree?.repo_path ? (
              <p className="mt-2">
                {t("cortex.memory.memoryRepo")}:{" "}
                <code className="rounded bg-background/70 px-1 py-0.5 text-[11px]">{memoryTree.repo_path}</code>
              </p>
            ) : null}
            {memoryTree?.install_hint ? (
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-background/70 px-2 py-1.5 text-[11px] text-foreground/80">
                {memoryTree.install_hint}
              </pre>
            ) : null}
            <code className="mt-2 block break-all rounded-lg bg-background/70 px-2 py-1.5 text-[11px] text-foreground/80">
              {contentPath}
            </code>
            <p className="mt-2">{t("cortex.memory.memorySetupFallback")}</p>
          </div>
        ) : null}

        {chunks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-background/40 p-4 text-sm leading-relaxed text-muted-foreground">
            <Database className="mb-2 h-5 w-5 text-guide-jade/70" />
            {t("cortex.memory.empty")}
          </div>
        ) : (
          <ul className="space-y-3">
            {chunks.map((chunk) => (
              <li
                key={`${chunk.source}:${chunk.path}`}
                className="rounded-2xl border border-border/50 bg-background/50 p-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{chunk.title}</p>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {chunk.source}
                  </span>
                </div>
                <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                  {chunk.summary}
                </p>
              </li>
            ))}
          </ul>
        )}

        {dashboard?.cortex_memory.long_term_preview ? (
          <div className="mt-4 rounded-2xl border border-guide-jade/20 bg-guide-jade/5 p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-guide-jade">
              {t("cortex.memory.cortexLayer")}
            </p>
            <p className="mt-2 line-clamp-6 text-xs leading-relaxed text-muted-foreground">
              {dashboard.cortex_memory.long_term_preview}
            </p>
          </div>
        ) : null}
      </div>
        </>
      )}
    </aside>
  );
}

function StatusChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "jade" | "amber" | "muted";
}) {
  const toneClass =
    tone === "jade"
      ? "text-guide-jade"
      : tone === "amber"
        ? "text-guide-amber"
        : "text-muted-foreground";
  return (
    <div className="rounded-xl bg-muted/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-medium", toneClass)}>{value}</p>
    </div>
  );
}
