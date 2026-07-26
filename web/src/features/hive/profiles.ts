/**
 * Display names from kind-0 profiles. Anyone may alias themselves by
 * publishing a profile; the key stays the identity anchor, so the UI always
 * shows a short key suffix alongside the name — an alias can inform, never
 * impersonate.
 */

import { useEffect, useState } from "react";
import type { HiveClient, HiveEvent } from "./hive-client";

export interface Profile {
  name?: string;
  about?: string;
  picture?: string;
}

function parseProfile(event: HiveEvent): Profile | null {
  try {
    const p = JSON.parse(event.content);
    return {
      name: typeof p.name === "string" ? p.name.slice(0, 48) : undefined,
      about: typeof p.about === "string" ? p.about.slice(0, 280) : undefined,
      picture: typeof p.picture === "string" ? p.picture : undefined,
    };
  } catch {
    return null;
  }
}

/** Short, stable key tag so aliases can't impersonate: last 4 of the npub-ish hex. */
export function keyTag(pubkey: string): string {
  return pubkey.slice(-4);
}

/** Live map of pubkey → latest profile, kept current from kind-0 events. */
export function useProfiles(client: HiveClient): Map<string, Profile> {
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  useEffect(() => {
    const latest = new Map<string, number>();
    return client.subscribe({ kinds: [0], limit: 500 }, (event) => {
      const prev = latest.get(event.pubkey) ?? 0;
      if (event.created_at < prev) return; // keep the newest profile only
      const profile = parseProfile(event);
      if (!profile) return;
      latest.set(event.pubkey, event.created_at);
      setProfiles((old) => {
        const next = new Map(old);
        next.set(event.pubkey, profile);
        return next;
      });
    });
  }, [client]);
  return profiles;
}

/** How a pubkey should read in the UI: "Kannaka ·a1b2" (name + key tag),
 *  or just the key tag when no profile exists. `self` appends "(you)". */
export function displayName(
  pubkey: string,
  profiles: Map<string, Profile>,
  self?: string,
): { name: string; tag: string; isSelf: boolean } {
  const isSelf = !!self && pubkey === self;
  const name = profiles.get(pubkey)?.name;
  return { name: name || `anon`, tag: keyTag(pubkey), isSelf };
}
