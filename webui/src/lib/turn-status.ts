import type { UIMessage } from "@/lib/types";

export type TurnPhase = "idle" | "waiting" | "thinking" | "tools" | "writing";

export interface TurnStatus {
  phase: TurnPhase;
  detail?: string;
}

export function deriveTurnStatus(
  messages: UIMessage[],
  isStreaming: boolean,
): TurnStatus {
  if (!isStreaming) {
    return { phase: "idle" };
  }

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.kind === "trace") {
      const line = message.traces?.[message.traces.length - 1] ?? message.content;
      return { phase: "tools", detail: line.trim() || undefined };
    }
    if (message.role === "assistant") {
      if (message.reasoningStreaming || (message.reasoning && !message.content.trim())) {
        return {
          phase: "thinking",
          detail: message.reasoning?.split("\n").filter(Boolean).at(-1)?.trim(),
        };
      }
      if (message.isStreaming && message.content.trim()) {
        return { phase: "writing" };
      }
      if (message.isStreaming) {
        return { phase: "waiting" };
      }
    }
  }

  return { phase: "waiting" };
}
