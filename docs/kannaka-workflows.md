# Kannaka memory workflows

Recipes wiring the Hive's workflow engine to Kannaka HRM memory via the
`kannaka_remember` / `kannaka_recall` step actions (see
[KANNAKA.md](KANNAKA.md) for the architecture, `crates/buzz-kannaka` for
the adapter). The relay host needs a `kannaka` binary on `PATH` (or
`BUZZ_KANNAKA_BIN`); `KANNAKA_DATA_DIR` selects the HRM store.

## Opt-in channel → HRM ingestion

The ADR-0045 Phase 3 item "opt-in channel→HRM ingestion" is a plain
workflow — saving one of these to a channel *is* the opt-in, per channel,
with the workflow's owner accountable for the flow:

```yaml
name: hive-ingest
trigger:
  on: message_posted
steps:
  - id: ingest
    action: kannaka_remember
    text: "{{trigger.author}} in #general: {{trigger.text}}"
    category: hive
```

`kannaka_remember` persists channel content outside the channel, so
saving or running this requires **owner/admin authority** on the channel
— the same SEC-006 gate as `call_webhook`. Use the trigger `filter` to
ingest selectively (e.g. only substantive messages):

```yaml
trigger:
  on: message_posted
  filter: 'trigger_text != "" && !str_starts_with(trigger_text, "!")'
```

## Memory-backed replies

`kannaka_recall` brings estate memory *into* the room (plain membership
suffices). Recalled memories are the step's output:

```yaml
name: hive-recall
trigger:
  on: message_posted
  filter: 'str_starts_with(trigger_text, "!recall ")'
steps:
  - id: lookup
    action: kannaka_recall
    query: "{{trigger.text}}"
    top_k: 5
  - id: reply
    action: send_message
    text: "Resonating memories: {{steps.lookup.output.memories}}"
```

## Scheduled consolidation notes

A periodic snapshot of what the workspace has been thinking about:

```yaml
name: hive-daily-note
trigger:
  on: schedule
  cron: "0 6 * * *"
steps:
  - id: recent
    action: kannaka_recall
    query: "what mattered in the last day"
    top_k: 3
  - id: post
    action: send_message
    text: "Morning resonance: {{steps.recent.output.memories}}"
```

Dream-cycle consolidation itself is not a workflow action — run
`kannaka dream` on the host's own schedule (it is the memory organ's
concern, not the room's).
