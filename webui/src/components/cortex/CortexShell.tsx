import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { CortexHeader } from "@/components/cortex/CortexHeader";
import {
  DistillProgressPanel,
  advanceStudioJob,
  type StudioJobState,
} from "@/components/cortex/DistillProgressPanel";
import { PersonaDetailSheet } from "@/components/cortex/PersonaDetailSheet";
import {
  GuideStudioDialog,
  type GuideStudioMode,
  type GuideStudioSubmit,
} from "@/components/cortex/GuideStudioDialog";
import { MemoryAddDialog } from "@/components/cortex/MemoryAddDialog";
import { MemorySynapsePanel } from "@/components/cortex/MemorySynapsePanel";
import { PersonaRail, PersonaStrip, FALLBACK_PERSONAS, type StudioAction } from "@/components/cortex/PersonaRail";
import { DeleteConfirm } from "@/components/DeleteConfirm";
import { SettingsView } from "@/components/settings/SettingsView";
import { ThreadShell } from "@/components/thread/ThreadShell";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useCortexDashboard } from "@/hooks/useCortexDashboard";
import { useSessions } from "@/hooks/useSessions";
import { useTheme } from "@/hooks/useTheme";
import { addMemoryInboxNote } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useClient } from "@/providers/ClientProvider";
import type { ChatSummary } from "@/lib/types";

const RESTART_STARTED_KEY = "guide_cortex-webui.restartStartedAt";
type ShellView = "chat" | "settings";

interface CortexShellProps {
  onModelNameChange: (modelName: string | null) => void;
  onLogout: () => void;
}

export function CortexShell({ onModelNameChange, onLogout }: CortexShellProps) {
  const { t } = useTranslation();
  const { client, modelName, token } = useClient();
  const { theme, toggle } = useTheme();
  const { sessions, refresh, createChat, deleteChat } = useSessions();
  const [memoryQuery, setMemoryQuery] = useState("");
  const { data: dashboard, loading: dashboardLoading, error: dashboardError, refresh: refreshDashboard } =
    useCortexDashboard(memoryQuery);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<string | null>("naval");
  const [view, setView] = useState<ShellView>("chat");
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ key: string; label: string } | null>(
    null,
  );
  const restartSawDisconnectRef = useRef(false);
  const [restartToast, setRestartToast] = useState<string | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [chatToast, setChatToast] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioMode, setStudioMode] = useState<GuideStudioMode>("distill");
  const [studioTargetId, setStudioTargetId] = useState<string | null>(null);
  const [memoryAddOpen, setMemoryAddOpen] = useState(false);
  const [pendingLaunch, setPendingLaunch] = useState<{ key: number; message: string; personaId: string } | null>(null);
  const [detailPersonaId, setDetailPersonaId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [studioJob, setStudioJob] = useState<StudioJobState | null>(null);

  const activeSession = useMemo<ChatSummary | null>(() => {
    if (!activeKey) return null;
    return sessions.find((s) => s.key === activeKey) ?? null;
  }, [sessions, activeKey]);

  const activePersonaMeta = useMemo(() => {
    if (!activePersona) return null;
    const fromDashboard = dashboard?.personas.find((p) => p.id === activePersona);
    if (fromDashboard) return fromDashboard;
    return FALLBACK_PERSONAS.find((p) => p.id === activePersona) ?? null;
  }, [activePersona, dashboard]);

  const onCreateChat = useCallback(async () => {
    try {
      const chatId = await createChat();
      setActiveKey(`websocket:${chatId}`);
      setView("chat");
      return chatId;
    } catch (e) {
      console.error("Failed to create chat", e);
      return null;
    }
  }, [createChat]);

  const onNewChat = useCallback(() => {
    setActiveKey(null);
    setView("chat");
    setChatToast(t("cortex.chat.ready"));
    window.setTimeout(() => setChatToast(null), 2_000);
  }, [t]);

  const onSelectChat = useCallback((key: string) => {
    setActiveKey(key);
    setView("chat");
  }, []);

  const onOpenSettings = useCallback(() => {
    setView("settings");
  }, []);

  const onBackToChat = useCallback(() => {
    setView("chat");
    setActiveKey((current) => {
      if (!current) return null;
      if (sessions.some((session) => session.key === current)) return current;
      return sessions[0]?.key ?? null;
    });
  }, [sessions]);

  const onRestart = useCallback(() => {
    const chatId = activeSession?.chatId ?? client.defaultChatId;
    if (!chatId) return;
    restartSawDisconnectRef.current = false;
    setIsRestarting(true);
    try {
      window.localStorage.setItem(RESTART_STARTED_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    client.sendMessage(chatId, "/restart");
  }, [activeSession?.chatId, client]);

  useEffect(() => {
    return client.onRuntimeModelUpdate((name) => onModelNameChange(name));
  }, [client, onModelNameChange]);

  useEffect(() => {
    return client.onStatus((status) => {
      let startedAt = 0;
      try {
        startedAt = Number(window.localStorage.getItem(RESTART_STARTED_KEY) ?? "0");
      } catch {
        startedAt = 0;
      }
      if (!startedAt) return;
      if (status !== "open") {
        restartSawDisconnectRef.current = true;
        return;
      }
      const elapsedMs = Date.now() - startedAt;
      if (!restartSawDisconnectRef.current && elapsedMs < 1500) return;
      try {
        window.localStorage.removeItem(RESTART_STARTED_KEY);
      } catch {
        // ignore
      }
      setIsRestarting(false);
      setRestartToast(
        t("app.restart.completed", { seconds: (elapsedMs / 1000).toFixed(1) }),
      );
      window.setTimeout(() => setRestartToast(null), 3_500);
    });
  }, [client, t]);

  const onTurnEnd = useCallback(() => {
    void refresh();
    void refreshDashboard();
    setStudioJob((job) => (job && !job.completed ? advanceStudioJob(job) : job));
  }, [refresh, refreshDashboard]);

  const openStudio = useCallback((action: StudioAction, targetId?: string) => {
    setStudioMode(action);
    setStudioTargetId(targetId ?? null);
    setStudioOpen(true);
  }, []);

  const handleStudioSubmit = useCallback((payload: GuideStudioSubmit) => {
    setActivePersona(payload.personaId);
    setActiveKey(null);
    setView("chat");
    setPendingLaunch({
      key: Date.now(),
      message: payload.message,
      personaId: payload.personaId,
    });
    setStudioJob({
      key: Date.now(),
      mode: payload.mode,
      subject: payload.message.slice(0, 48),
      phaseIndex: 0,
      completed: false,
    });
    setChatToast(t("cortex.studio.launching"));
    window.setTimeout(() => setChatToast(null), 2_000);
  }, [t]);

  const handleAddMemory = useCallback(
    async (payload: { title: string; content: string }) => {
      await addMemoryInboxNote(token, payload);
      await refreshDashboard();
      setChatToast(t("cortex.memory.addSuccess"));
      window.setTimeout(() => setChatToast(null), 2_500);
    },
    [refreshDashboard, t, token],
  );

  const onConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const key = pendingDelete.key;
    const deletingActive = activeKey === key;
    const currentIndex = sessions.findIndex((s) => s.key === key);
    const fallbackKey = deletingActive
      ? (sessions[currentIndex + 1]?.key ?? sessions[currentIndex - 1]?.key ?? null)
      : activeKey;
    setPendingDelete(null);
    if (deletingActive) setActiveKey(fallbackKey);
    try {
      await deleteChat(key);
    } catch (e) {
      if (deletingActive) setActiveKey(key);
      console.error("Failed to delete session", e);
    }
  }, [pendingDelete, deleteChat, activeKey, sessions]);

  const headerTitle = activeSession
    ? activeSession.title ||
      activeSession.preview ||
      t("chat.fallbackTitle", { id: activeSession.chatId.slice(0, 6) })
    : t("app.brand");

  useEffect(() => {
    document.title =
      view === "settings"
        ? t("app.documentTitle.chat", { title: t("settings.sidebar.title") })
        : activeSession
          ? t("app.documentTitle.chat", { title: headerTitle })
          : t("app.documentTitle.base");
  }, [activeSession, headerTitle, t, view]);

  return (
    <div className="cortex-shell relative flex h-full w-full overflow-hidden bg-background">
      <div
        className={cn(
          "absolute inset-0 cortex-grid pointer-events-none opacity-60",
        )}
        aria-hidden
      />

      {view === "chat" ? (
        <>
          <div className="relative z-10 hidden h-full lg:flex">
            <PersonaRail
              personas={dashboard?.personas ?? []}
              categories={dashboard?.persona_categories ?? []}
              activePersona={activePersona}
              onSelect={setActivePersona}
              onStudioAction={openStudio}
              onPersonaDetail={(id) => {
                setDetailPersonaId(id);
                setDetailOpen(true);
              }}
              loading={dashboardLoading}
            />
          </div>
          <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {dashboardError ? (
              <div className="border-b border-guide-amber/30 bg-guide-amber/10 px-4 py-2 text-xs leading-relaxed text-foreground/90">
                {t("cortex.banner.gatewayStale", { detail: dashboardError })}
              </div>
            ) : null}
            <CortexHeader
              title={headerTitle}
              modelName={modelName}
              activePersona={activePersonaMeta}
              sessions={sessions}
              activeKey={activeKey}
              onNewChat={onNewChat}
              onSelectSession={onSelectChat}
              onOpenSettings={onOpenSettings}
              onOpenMemory={() => setMemoryOpen(true)}
              theme={theme}
              onToggleTheme={toggle}
            />
            <PersonaStrip
              personas={dashboard?.personas ?? []}
              activePersona={activePersona}
              onSelect={setActivePersona}
              onStudioAction={(action) => openStudio(action)}
              compact
            />
            <DistillProgressPanel
              job={studioJob}
              onDismiss={() => setStudioJob(null)}
            />
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <ThreadShell
                session={activeSession}
                title={headerTitle}
                onToggleSidebar={() => {}}
                onNewChat={onNewChat}
                onCreateChat={onCreateChat}
                onTurnEnd={onTurnEnd}
                theme={theme}
                onToggleTheme={toggle}
                hideSidebarToggleOnDesktop
                variant="cortex"
                cortexPersona={activePersona}
                pendingLaunch={pendingLaunch}
                onPendingLaunchConsumed={() => setPendingLaunch(null)}
              />
            </div>
          </div>
          <div className="relative z-10 hidden h-full xl:flex">
            <MemorySynapsePanel
              dashboard={dashboard}
              loading={dashboardLoading}
              error={dashboardError}
              onRefresh={() => void refreshDashboard()}
              onSearch={setMemoryQuery}
              onAddMemory={() => setMemoryAddOpen(true)}
            />
          </div>
          <Sheet open={memoryOpen} onOpenChange={setMemoryOpen}>
            <SheetContent side="right" className="w-full max-w-md p-0 xl:hidden">
              <MemorySynapsePanel
                dashboard={dashboard}
                loading={dashboardLoading}
                error={dashboardError}
                onRefresh={() => void refreshDashboard()}
                onSearch={setMemoryQuery}
                onAddMemory={() => setMemoryAddOpen(true)}
                className="h-full w-full border-l-0"
              />
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          <SettingsView
            theme={theme}
            onToggleTheme={toggle}
            onBackToChat={onBackToChat}
            onModelNameChange={onModelNameChange}
            onLogout={onLogout}
            onRestart={onRestart}
            isRestarting={isRestarting}
          />
        </div>
      )}

      <DeleteConfirm
        open={!!pendingDelete}
        title={pendingDelete?.label ?? ""}
        onCancel={() => setPendingDelete(null)}
        onConfirm={onConfirmDelete}
      />
      <GuideStudioDialog
        open={studioOpen}
        mode={studioMode}
        personas={dashboard?.personas ?? []}
        initialTargetId={studioTargetId}
        onOpenChange={setStudioOpen}
        onSubmit={handleStudioSubmit}
      />
      <MemoryAddDialog
        open={memoryAddOpen}
        onOpenChange={setMemoryAddOpen}
        onSubmit={handleAddMemory}
      />
      <PersonaDetailSheet
        personaId={detailPersonaId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSelectPersona={(id) => {
          setActivePersona(id);
          setDetailOpen(false);
        }}
        onUpdatePersona={(id) => {
          setDetailOpen(false);
          openStudio("update", id);
        }}
      />
      {restartToast ? (
        <div
          role="status"
          className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-guide-jade/30 bg-popover px-4 py-2 text-sm font-medium text-popover-foreground shadow-lg"
        >
          {restartToast}
        </div>
      ) : null}
      {chatToast ? (
        <div
          role="status"
          className="fixed left-1/2 top-14 z-50 -translate-x-1/2 rounded-full border border-border/70 bg-popover px-4 py-2 text-sm font-medium text-popover-foreground shadow-lg"
        >
          {chatToast}
        </div>
      ) : null}
    </div>
  );
}
