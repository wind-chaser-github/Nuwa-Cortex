import {
  Brain,
  MessageSquarePlus,
  Moon,
  Settings2,
  Sun,
  Waves,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { ConnectionBadge } from "@/components/ConnectionBadge";
import { cn } from "@/lib/utils";
import type { ChatSummary, CortexPersona } from "@/lib/types";

interface CortexHeaderProps {
  title: string;
  modelName: string | null;
  activePersona: CortexPersona | null;
  sessions: ChatSummary[];
  activeKey: string | null;
  onNewChat: () => void;
  onSelectSession: (key: string) => void;
  onOpenSettings: () => void;
  onOpenMemory?: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function CortexHeader({
  title,
  modelName,
  activePersona,
  sessions,
  activeKey,
  onNewChat,
  onSelectSession,
  onOpenSettings,
  onOpenMemory,
  theme,
  onToggleTheme,
}: CortexHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="cortex-header flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-guide-jade/30 to-guide-amber/20 text-guide-jade shadow-inner">
          <Waves className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold tracking-tight">
            {title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {activePersona
              ? t("cortex.header.personaActive", { name: activePersona.label })
              : t("cortex.header.defaultMode")}
            {modelName ? ` · ${modelName}` : ""}
          </p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ConnectionBadge />
        <select
          value={activeKey ?? ""}
          onChange={(e) => {
            if (e.target.value) onSelectSession(e.target.value);
          }}
          className="hidden h-9 max-w-[180px] truncate rounded-xl border border-border/60 bg-background/70 px-2 text-xs outline-none md:block"
          aria-label={t("cortex.header.sessionSelect")}
        >
          <option value="">{t("cortex.header.noSession")}</option>
          {sessions.map((s) => (
            <option key={s.key} value={s.key}>
              {s.title || s.preview || s.chatId.slice(0, 8)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-guide-jade/30 bg-guide-jade/10 px-3 text-xs font-medium text-guide-jade transition hover:bg-guide-jade/15"
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span className="hidden sm:inline">{t("sidebar.newChat")}</span>
        </button>
        <button
          type="button"
          onClick={onOpenMemory}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background/60 px-3 text-xs font-medium text-muted-foreground transition hover:text-foreground xl:hidden"
        >
          <Brain className="h-4 w-4" />
          <span className="hidden sm:inline">{t("cortex.memory.title")}</span>
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground transition hover:text-foreground"
          aria-label={t("sidebar.toggleTheme")}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground transition hover:text-foreground",
          )}
          aria-label={t("sidebar.settings")}
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
