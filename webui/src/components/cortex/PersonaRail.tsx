import {
  Brain,
  Compass,
  FlaskConical,
  Info,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  UserRound,
  Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { CortexPersona, CortexPersonaCategory } from "@/lib/types";

export const FALLBACK_PERSONAS: CortexPersona[] = [
  {
    id: "naval",
    name: "naval",
    label: "Naval",
    description: "长期主义、杠杆、特定知识",
    kind: "persona",
    category: "startup",
    source: "workspace",
  },
  {
    id: "socrates",
    name: "socrates",
    label: "苏格拉底",
    description: "追问式澄清与自洽",
    kind: "persona",
    category: "philosophy",
    source: "workspace",
  },
];

const PERSONA_ICONS: Record<string, typeof Sparkles> = {
  naval: Compass,
  socrates: Brain,
  "skill-distill": Wand2,
};

export type StudioAction = "distill" | "framework" | "recommend" | "update";

interface PersonaRailProps {
  personas: CortexPersona[];
  categories?: CortexPersonaCategory[];
  activePersona: string | null;
  onSelect: (id: string | null) => void;
  onStudioAction?: (action: StudioAction, targetId?: string) => void;
  onPersonaDetail?: (id: string) => void;
  loading?: boolean;
}

function categoryLabel(
  categoryId: string,
  categories: CortexPersonaCategory[],
  locale: string,
): string {
  const row = categories.find((c) => c.id === categoryId);
  if (!row) return categoryId;
  return locale.startsWith("zh") ? row.label_zh : row.label_en;
}

function groupPersonas(
  personas: CortexPersona[],
  categories: CortexPersonaCategory[],
  filter: string,
) {
  const q = filter.trim().toLowerCase();
  const mentors = personas.filter((p) => p.kind === "persona");
  const tools = personas.filter((p) => p.kind === "meta");
  const filtered = mentors.filter((p) => {
    if (!q) return true;
    const hay = `${p.label} ${p.name} ${p.description}`.toLowerCase();
    return hay.includes(q);
  });

  const order = categories.map((c) => c.id);
  const buckets = new Map<string, CortexPersona[]>();
  for (const persona of filtered) {
    const key = persona.category || "other";
    const list = buckets.get(key) ?? [];
    list.push(persona);
    buckets.set(key, list);
  }

  const grouped: Array<{ id: string; items: CortexPersona[] }> = [];
  for (const id of order) {
    const items = buckets.get(id);
    if (items?.length) grouped.push({ id, items });
  }
  for (const [id, items] of buckets) {
    if (!order.includes(id) && items.length) grouped.push({ id, items });
  }
  return { grouped, tools, mentors };
}

export function PersonaRail({
  personas,
  categories = [],
  activePersona,
  onSelect,
  onStudioAction,
  onPersonaDetail,
  loading = false,
}: PersonaRailProps) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState("");
  const source =
    personas.filter((p) => p.kind === "persona" || p.kind === "meta").length > 0
      ? personas
      : FALLBACK_PERSONAS;
  const { grouped, tools, mentors } = useMemo(
    () => groupPersonas(source, categories, filter),
    [source, categories, filter],
  );

  return (
    <aside className="cortex-rail flex h-full w-[248px] shrink-0 flex-col border-r border-border/50">
      <div className="border-b border-border/40 px-4 py-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-guide-jade/80">
          {t("cortex.rail.eyebrow")}
        </p>
        <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-foreground">
          {t("cortex.rail.title")}
        </h2>
      </div>

      <div className="border-b border-border/30 px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("cortex.rail.searchPlaceholder")}
            className="h-9 w-full rounded-xl border border-border/60 bg-background/60 pl-9 pr-3 text-xs outline-none focus:border-guide-jade/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
        <PersonaCard
          active={activePersona === null}
          label={t("cortex.rail.default")}
          description={t("cortex.rail.defaultHint")}
          icon={UserRound}
          onClick={() => onSelect(null)}
        />

        {loading && mentors.length === 0 ? (
          <div className="space-y-2 px-1 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-xl bg-muted/40" />
            ))}
          </div>
        ) : null}

        {grouped.map((section) => (
          <div key={section.id} className="mb-3">
            <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {categoryLabel(section.id, categories, i18n.language)}
            </p>
            {section.items.map((persona) => (
              <PersonaCard
                key={persona.id}
                active={activePersona === persona.id}
                label={persona.label || persona.name}
                description={persona.description}
                icon={PERSONA_ICONS[persona.id] ?? Sparkles}
                onClick={() => onSelect(persona.id)}
                onUpdate={
                  onStudioAction ? () => onStudioAction("update", persona.id) : undefined
                }
                onDetail={onPersonaDetail ? () => onPersonaDetail(persona.id) : undefined}
              />
            ))}
          </div>
        ))}

        {tools.length > 0 ? (
          <div className="mb-2">
            <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {categoryLabel("tools", categories, i18n.language)}
            </p>
            {tools.map((persona) => (
              <PersonaCard
                key={persona.id}
                active={activePersona === persona.id}
                label={persona.label || persona.name}
                description={persona.description}
                icon={PERSONA_ICONS[persona.id] ?? FlaskConical}
                onClick={() =>
                  persona.id === "skill-distill" && onStudioAction
                    ? onStudioAction("distill")
                    : onSelect(persona.id)
                }
                onDetail={onPersonaDetail ? () => onPersonaDetail(persona.id) : undefined}
              />
            ))}
          </div>
        ) : null}
      </div>

      {onStudioAction ? (
        <div className="border-t border-border/40 p-3">
          <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {t("cortex.rail.actions")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <StudioButton
              icon={Plus}
              label={t("cortex.studio.distill.short")}
              onClick={() => onStudioAction("distill")}
            />
            <StudioButton
              icon={Layers}
              label={t("cortex.studio.framework.short")}
              onClick={() => onStudioAction("framework")}
            />
            <StudioButton
              icon={Search}
              label={t("cortex.studio.recommend.short")}
              onClick={() => onStudioAction("recommend")}
            />
          </div>
        </div>
      ) : null}
    </aside>
  );
}

interface PersonaStripProps {
  personas: CortexPersona[];
  categories?: CortexPersonaCategory[];
  activePersona: string | null;
  onSelect: (id: string | null) => void;
  onStudioAction?: (action: StudioAction) => void;
  compact?: boolean;
}

export function PersonaStrip({
  personas,
  activePersona,
  onSelect,
  onStudioAction,
  compact = false,
}: PersonaStripProps) {
  const { t } = useTranslation();
  const mentors =
    personas.filter((p) => p.kind === "persona").length > 0
      ? personas.filter((p) => p.kind === "persona")
      : FALLBACK_PERSONAS.filter((p) => p.kind === "persona");

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border/40 bg-background/70 px-4 py-2.5 backdrop-blur-sm",
        compact && "px-3 py-2",
      )}
    >
      <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {t("cortex.rail.title")}
      </span>
      <PersonaChip
        active={activePersona === null}
        label={t("cortex.rail.default")}
        icon={UserRound}
        onClick={() => onSelect(null)}
      />
      {mentors.slice(0, 8).map((persona) => {
        const Icon = PERSONA_ICONS[persona.id] ?? Sparkles;
        return (
          <PersonaChip
            key={persona.id}
            active={activePersona === persona.id}
            label={persona.label || persona.name}
            icon={Icon}
            onClick={() => onSelect(persona.id)}
          />
        );
      })}
      {onStudioAction ? (
        <PersonaChip
          active={false}
          label={t("cortex.studio.distill.short")}
          icon={Plus}
          onClick={() => onStudioAction("distill")}
        />
      ) : null}
    </div>
  );
}

function PersonaCard({
  active,
  label,
  description,
  icon: Icon,
  onClick,
  onUpdate,
  onDetail,
}: {
  active: boolean;
  label: string;
  description: string;
  icon: typeof Sparkles;
  onClick: () => void;
  onUpdate?: () => void;
  onDetail?: () => void;
}) {
  return (
    <div className="group mb-2 flex gap-1">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex min-w-0 flex-1 items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all",
          active
            ? "border-guide-jade/50 bg-guide-jade/10 shadow-[0_0_0_1px_hsl(var(--guide-jade)/0.15)]"
            : "border-transparent bg-card/40 hover:border-border/60 hover:bg-card/70",
        )}
      >
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-guide-jade">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium capitalize">{label}</span>
          <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        </span>
      </button>
      {onDetail ? (
        <button
          type="button"
          onClick={onDetail}
          title="详情"
          className="mt-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground opacity-0 transition-all hover:border-border/60 hover:bg-card/70 hover:text-foreground group-hover:opacity-100"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {onUpdate ? (
        <button
          type="button"
          onClick={onUpdate}
          title="更新"
          className="mt-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground opacity-0 transition-all hover:border-border/60 hover:bg-card/70 hover:text-foreground group-hover:opacity-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function StudioButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/50 px-2.5 py-2 text-left text-[11px] font-medium leading-tight text-foreground/85 transition hover:border-guide-jade/30 hover:bg-card"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-guide-jade" />
      <span>{label}</span>
    </button>
  );
}

function PersonaChip({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof Sparkles;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        active
          ? "border-guide-jade/50 bg-guide-jade/15 text-guide-jade shadow-sm"
          : "border-border/60 bg-card/50 text-foreground/80 hover:border-guide-jade/30 hover:bg-card",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="capitalize">{label}</span>
    </button>
  );
}
