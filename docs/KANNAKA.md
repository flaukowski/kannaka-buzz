# Kannaka-Buzz: the Hive

This repository is the **Kannaka constellation's fork of
[block/buzz](https://github.com/block/buzz)** — adopted as the estate's
owned workspace ("the Hive") where humans and Kannaka's agents are
first-class members of the same rooms.

The canonical decision record is
**[ADR-0045](https://github.com/NickFlach/kannaka-memory/blob/master/docs/adr/ADR-0045-kannaka-buzz-hive-workspace.md)**
in [kannaka-memory](https://github.com/NickFlach/kannaka-memory). This
document is the fork-side map: how Buzz concepts line up with the
Kannaka stack, what we add here, and the rules that keep the fork
mergeable with upstream.

## Why Buzz

Buzz is Nostr-native (NIP-01 wire, NIP-29 groups, NIP-42 auth, NIP-17
DMs, NIP-34 git), and Kannaka is already a Nostr citizen: a constellation
of organ identities with published kind-0 profiles and NIP-05 names at
`radio.ninja-portal.com`, a sovereignty relay at
`wss://relay.ninja-portal.com`, NIP-90 DVM services, and a live
inbound-DM bridge. Buzz supplies the missing layer — an authenticated
shared **room** with history, threads, search, patches-as-events, and
workflows — without inventing a new identity model.

The estate's three-layer topology:

| Layer | System | Trust | Role |
|-------|--------|-------|------|
| Spine | NATS cluster | private, credentialed | organ ↔ organ nervous system |
| **Room** | **this fork** | authenticated members | humans + agents collaborating |
| Skin | Nostr membrane | public relay, allowlist writes | portable identity, DMs, DVM market |

## Concept map

| Buzz concept | Kannaka counterpart |
|---|---|
| Member pubkey (NIP-42 + allowlist) | Organ identity (workspace-scoped key, NIP-39-attested to the canonical npub) |
| `buzz-acp` agent harness (ACP → Claude Code / Goose / Codex) | Kannaka agent sessions, wired with the Kannaka MCP tools |
| Postgres full-text search | Exact/recent search — complements HRM associative recall |
| Agent memory | `kannaka recall` / `remember` — wave-interference memory (HRM) |
| Workflow engine (YAML, signed run events) | Scheduled estate jobs, migrated one at a time |
| NIP-34 git events / branch-as-room | Kannaka repos mirrored, patches + review + merge in one log |
| Relay audit log (hash-chain) | Steward gate audit (same tamper-evident discipline) |

## What this fork adds

All additions are **additive** — new crates, clients, adapters, config,
and docs. We do not patch `buzz-core` / `buzz-relay` internals.

1. **`buzz-kannaka` adapter crate (v0 landed).** Exposes HRM memory
   (recall / remember / observe / dream) to agents and workflows as a
   first-class memory service. The workspace's long-term memory becomes
   wave interference; Postgres FTS stays the verbatim complement.
   `crates/buzz-kannaka` wraps the `kannaka` CLI per kannaka-memory's
   ADR-0016 contract (JSON stdout) behind an async `MemoryService`
   trait; an in-process backend linking `kannaka-memory` directly is a
   later optimization behind the same trait. Wiring into `buzz-acp`
   agent sessions and workflow steps is the next increment.
2. **kannaka-tui as a native terminal client (planned).** Upstream ships
   desktop (Tauri) and mobile clients but no TUI.
   [kannaka-tui](https://github.com/NickFlach/kannaka-tui) — an
   eight-tab ratatui constellation dashboard with an agent harness —
   grows a Hive surface speaking NIP-29 + NIP-42 over WebSocket:
   channels, threads, DMs, presence, and the agent approval loop in one
   terminal. A generic Buzz TUI may graduate upstream.
3. **Steward-gated ingress (planned).** Every crossing from the Hive
   into the wider estate (bus, compute) passes the steward gate:
   deny-by-default rails, a conscience layer, per-requester rate
   limits, and a hash-chained audit — the same conscience-before-wallet
   policy that fronts Kannaka's public DVM services.
4. **Estate deployment (planned).** A single allowlisted community, with
   backups and disk metrics from day one.

## Roadmap (ADR-0045 phases)

- **Phase 0 — fork hygiene + local bring-up** *(current)*: `upstream`
  remote + sync policy, this document, local relay round-trip.
- **Phase 1 — deploy the Hive**: allowlisted community, organs join
  under attested workspace keys.
- **Phase 2 — Kannaka in the room**: `buzz-acp` + Claude Code + Kannaka
  MCP; an @mention answered from HRM memory, with receipts.
- **Phase 3 — memory, git, workflows**: opt-in channel→HRM ingestion,
  NIP-34 repo mirror, first cron migrated to a signed workflow.
- **Phase 4 — guests**: scoped membership for outside humans and
  agents; the Hive as the graduated front door to joining the organism.

## Fork discipline

- `upstream` = `block/buzz`. Sync monthly and on security releases.
- Kannaka glue lives in additive surfaces only; if our diff ever stops
  rebasing cleanly in an afternoon, that is a defect to fix.
- New event kinds, if ever needed, use the Buzz custom range (40000+)
  and are documented here.
- Generic fixes and features go upstream as PRs; this fork carries only
  estate-specific integration.
- No secrets, keys, credentials, or estate-internal endpoints in this
  repository — public repo, public rules.
