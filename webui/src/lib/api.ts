import type {
  ChatSummary,
  CortexDashboard,
  CortexPersonaDetail,
  ProviderSettingsUpdate,
  SettingsPayload,
  SettingsUpdate,
  SlashCommand,
  WebSearchSettingsUpdate,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...(init ?? {}),
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
    credentials: "same-origin",
  });
  if (!res.ok) {
    throw new ApiError(res.status, `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function splitKey(key: string): { channel: string; chatId: string } {
  const idx = key.indexOf(":");
  if (idx === -1) return { channel: "", chatId: key };
  return { channel: key.slice(0, idx), chatId: key.slice(idx + 1) };
}

export async function listSessions(
  token: string,
  base: string = "",
): Promise<ChatSummary[]> {
  type Row = {
    key: string;
    created_at: string | null;
    updated_at: string | null;
    title?: string;
    preview?: string;
  };
  const body = await request<{ sessions: Row[] }>(
    `${base}/api/sessions`,
    token,
  );
  return body.sessions.map((s) => ({
    key: s.key,
    ...splitKey(s.key),
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    title: s.title ?? "",
    preview: s.preview ?? "",
  }));
}

/** Signed image URL attached to a historical user message. The server
 * emits these in place of raw on-disk paths so the client can render
 * previews without learning where media lives on disk. Each URL is a
 * self-authenticating ``/api/media/...`` route (see backend
 * ``_sign_media_path``) safe to drop into an ``<img src>`` attribute. */
export interface SessionMediaUrl {
  url: string;
  name?: string;
}

export async function fetchSessionMessages(
  token: string,
  key: string,
  base: string = "",
): Promise<{
  key: string;
  created_at: string | null;
  updated_at: string | null;
  messages: Array<{
    role: string;
    content: string;
    timestamp?: string;
    tool_calls?: unknown;
    reasoning_content?: string | null;
    thinking_blocks?: unknown;
    tool_call_id?: string;
    name?: string;
    /** Present on ``user`` turns that attached images. Paths have already
     * been stripped server-side; only the signed fetch URLs survive. */
    media_urls?: SessionMediaUrl[];
  }>;
}> {
  return request(
    `${base}/api/sessions/${encodeURIComponent(key)}/messages`,
    token,
  );
}

export async function deleteSession(
  token: string,
  key: string,
  base: string = "",
): Promise<boolean> {
  const body = await request<{ deleted: boolean }>(
    `${base}/api/sessions/${encodeURIComponent(key)}/delete`,
    token,
  );
  return body.deleted;
}

export async function fetchSettings(
  token: string,
  base: string = "",
): Promise<SettingsPayload> {
  return request<SettingsPayload>(`${base}/api/settings`, token);
}

export async function listSlashCommands(
  token: string,
  base: string = "",
): Promise<SlashCommand[]> {
  type Row = {
    command: string;
    title: string;
    description: string;
    icon: string;
    arg_hint?: string;
  };
  const body = await request<{ commands: Row[] }>(`${base}/api/commands`, token);
  return body.commands
    .filter((command) => !["/stop", "/restart"].includes(command.command))
    .map((command) => ({
      command: command.command,
      title: command.title,
      description: command.description,
      icon: command.icon,
      argHint: command.arg_hint ?? "",
    }));
}

export async function updateSettings(
  token: string,
  update: SettingsUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  if (update.model !== undefined) query.set("model", update.model);
  if (update.provider !== undefined) query.set("provider", update.provider);
  return request<SettingsPayload>(`${base}/api/settings/update?${query}`, token);
}

export async function updateProviderSettings(
  token: string,
  update: ProviderSettingsUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  query.set("provider", update.provider);
  if (update.apiKey !== undefined) query.set("api_key", update.apiKey);
  if (update.apiBase !== undefined) query.set("api_base", update.apiBase);
  return request<SettingsPayload>(
    `${base}/api/settings/provider/update?${query}`,
    token,
  );
}

export async function updateWebSearchSettings(
  token: string,
  update: WebSearchSettingsUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  query.set("provider", update.provider);
  if (update.apiKey !== undefined) query.set("api_key", update.apiKey);
  if (update.baseUrl !== undefined) query.set("base_url", update.baseUrl);
  return request<SettingsPayload>(
    `${base}/api/settings/web-search/update?${query}`,
    token,
  );
}

export async function fetchCortexDashboard(
  token: string,
  query: string = "",
  base: string = "",
): Promise<CortexDashboard> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  const suffix = params.toString() ? `?${params}` : "";
  return request(`${base}/api/guide/dashboard${suffix}`, token);
}

export async function addMemoryInboxNote(
  token: string,
  payload: { title: string; content: string },
  base: string = "",
): Promise<{ ok: boolean; path: string }> {
  const params = new URLSearchParams();
  params.set("title", payload.title);
  params.set("content_b64", btoa(unescape(encodeURIComponent(payload.content))));
  return request(`${base}/api/guide/memory/inbox/add?${params}`, token);
}

export async function fetchPersonaDetail(
  token: string,
  personaId: string,
  base: string = "",
): Promise<CortexPersonaDetail> {
  const params = new URLSearchParams({ id: personaId });
  return request(`${base}/api/guide/personas/detail?${params}`, token);
}

export async function addPersonaIngest(
  token: string,
  payload: { personaId: string; title?: string; content?: string; url?: string },
  base: string = "",
): Promise<{ ok: boolean; result: Record<string, unknown> }> {
  const params = new URLSearchParams();
  params.set("persona_id", payload.personaId);
  if (payload.title) params.set("title", payload.title);
  if (payload.url) params.set("url", payload.url);
  if (payload.content) {
    params.set("content_b64", btoa(unescape(encodeURIComponent(payload.content))));
  }
  return request(`${base}/api/guide/personas/ingest/add?${params}`, token);
}

export async function runPersonaIngest(
  token: string,
  personaId?: string,
  base: string = "",
): Promise<{ ok: boolean; result?: Record<string, unknown>; results?: unknown[] }> {
  const params = new URLSearchParams();
  if (personaId) params.set("id", personaId);
  const suffix = params.toString() ? `?${params}` : "";
  return request(`${base}/api/guide/personas/ingest/run${suffix}`, token);
}

export async function runPersonaUpgrade(
  token: string,
  personaId: string,
  notes: string = "",
  base: string = "",
): Promise<{ ok: boolean; started: boolean; persona_id: string }> {
  const params = new URLSearchParams({ id: personaId });
  if (notes.trim()) params.set("notes", notes.trim());
  return request(`${base}/api/guide/personas/upgrade/run?${params}`, token);
}
