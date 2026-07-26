/**
 * Live room signals: who's typing, reactions per message, and the member
 * roster. All fed by the relay's own event kinds (20002 typing, 7 reactions,
 * 39002 group members), so they stay current with no polling.
 */

import { useEffect, useMemo, useState } from "react";
import type { HiveClient, HiveEvent } from "./hive-client";

/** Pubkeys currently typing in `channelId` (excluding `self`), last ~6s. */
export function useTyping(
  client: HiveClient,
  channelId: string | null,
  self: string,
): string[] {
  const [seen, setSeen] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!channelId) return;
    setSeen(new Map());
    return client.subscribe(
      { kinds: [20002], "#h": [channelId] },
      (event: HiveEvent) => {
        if (event.pubkey === self) return;
        setSeen((prev) => new Map(prev).set(event.pubkey, Date.now()));
      },
    );
  }, [client, channelId, self]);

  // Prune expired typers on a timer. This must mutate `seen` (not just force a
  // re-render) so the derived list below actually drops stale entries —
  // otherwise the indicator sticks on the last typer forever.
  useEffect(() => {
    const t = setInterval(() => {
      setSeen((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [pk, at] of prev) {
          if (now - at >= 6000) {
            next.delete(pk);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1500);
    return () => clearInterval(t);
  }, []);

  return useMemo(
    () =>
      [...seen.entries()]
        .filter(([, at]) => Date.now() - at < 6000)
        .map(([pk]) => pk),
    [seen],
  );
}

/** emoji → count and whether `self` reacted, per message id, for a channel. */
export interface ReactionState {
  counts: Record<string, number>;
  mine: Set<string>;
}
export function useReactions(
  client: HiveClient,
  channelId: string | null,
  self: string,
): Map<string, ReactionState> {
  const [byTarget, setByTarget] = useState<Map<string, Map<string, string>>>(
    new Map(),
  );
  useEffect(() => {
    if (!channelId) return;
    setByTarget(new Map());
    return client.subscribe(
      { kinds: [7], "#h": [channelId], limit: 500 },
      (event: HiveEvent) => {
        const target = event.tags.find((t) => t[0] === "e")?.[1];
        if (!target) return;
        const emoji = event.content || "+";
        setByTarget((prev) => {
          const next = new Map(prev);
          const reactors = new Map(next.get(target) ?? []);
          // one reaction per (reactor,target); latest wins ("-" content withdraws)
          if (emoji === "-") reactors.delete(event.pubkey);
          else reactors.set(event.pubkey, emoji);
          next.set(target, reactors);
          return next;
        });
      },
    );
  }, [client, channelId]);

  return useMemo(() => {
    const out = new Map<string, ReactionState>();
    for (const [target, reactors] of byTarget) {
      const counts: Record<string, number> = {};
      const mine = new Set<string>();
      for (const [pk, emoji] of reactors) {
        counts[emoji] = (counts[emoji] ?? 0) + 1;
        if (pk === self) mine.add(emoji);
      }
      out.set(target, { counts, mine });
    }
    return out;
  }, [byTarget, self]);
}

/** Member pubkeys of `channelId` from the relay-signed kind-39002 list. */
export function useMembers(
  client: HiveClient,
  channelId: string | null,
): string[] {
  const [members, setMembers] = useState<string[]>([]);
  useEffect(() => {
    if (!channelId) return;
    setMembers([]);
    return client.subscribe(
      { kinds: [39002], "#d": [channelId] },
      (event: HiveEvent) => {
        const pks = event.tags.filter((t) => t[0] === "p").map((t) => t[1]);
        if (pks.length) setMembers(pks);
      },
    );
  }, [client, channelId]);
  return members;
}
