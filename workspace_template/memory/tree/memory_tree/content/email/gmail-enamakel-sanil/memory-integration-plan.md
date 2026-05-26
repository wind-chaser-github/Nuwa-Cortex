---
source_kind: email
source_id: "gmail:enamakel@tinyhumans.ai|sanil@tinyhumans.ai"
seq: 0
owner: sanil@tinyhumans.ai
timestamp: 2026-03-12T09:14:00Z
time_range_start: 2026-03-12T08:09:00Z
time_range_end: 2026-03-12T09:14:00Z
source_ref: gmail://thread/memory-integration-2026-03
tags:
  - source/gmail-enamakel-sanil
  - project/Memory Tree
  - topic/memory-layer
---
## 2026-03-12T09:14:00Z — sanil

Memory integration plan for Memory Tree desktop:

- Keep JSON-RPC as transport for the desktop core.
- Memory layer uses namespace as the main scope key.
- Local-first: no user_id in the storage contract for desktop runtime.
- Target milestone: March 22, 2026.

Action items: Ravi owns Rust memory API alignment; Asha owns Neocortex v2 ingestion experiment.

Durable preference: keep the memory core simple first; delay graph traversal until ingestion and recall are stable.
