/**
 * Persistent browser identity for the Hive.
 *
 * The secret key lives in localStorage on the member's own device — the
 * relay never sees it. Import accepts nsec or 64-char hex; minting
 * generates a fresh keypair. Membership is decided by the relay's
 * pubkey allowlist, not by this module.
 */

import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { npubEncode, nsecEncode, decode } from "nostr-tools/nip19";

const STORAGE_KEY = "kannaka-hive-secret-v1";

export interface HiveIdentity {
  secret: Uint8Array;
  pubkey: string;
  npub: string;
}

function fromSecret(secret: Uint8Array): HiveIdentity {
  const pubkey = getPublicKey(secret);
  return { secret, pubkey, npub: npubEncode(pubkey) };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error("Expected a 64-character hex key or an nsec.");
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function loadIdentity(): HiveIdentity | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return fromSecret(hexToBytes(stored));
  } catch {
    return null;
  }
}

export function mintIdentity(): HiveIdentity {
  const secret = generateSecretKey();
  localStorage.setItem(STORAGE_KEY, bytesToHex(secret));
  return fromSecret(secret);
}

/** Accepts an nsec1… string or raw 64-char hex. Throws with a plain message. */
export function importIdentity(input: string): HiveIdentity {
  const trimmed = input.trim();
  let secret: Uint8Array;
  if (trimmed.startsWith("nsec1")) {
    const decoded = decode(trimmed);
    if (decoded.type !== "nsec") {
      throw new Error("That key decodes, but it isn't an nsec.");
    }
    secret = decoded.data;
  } else {
    secret = hexToBytes(trimmed);
  }
  localStorage.setItem(STORAGE_KEY, bytesToHex(secret));
  return fromSecret(secret);
}

export function clearIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** For the one-time "back up your key" affordance after minting. */
export function exportNsec(identity: HiveIdentity): string {
  return nsecEncode(identity.secret);
}

export function shortKey(pubkeyOrNpub: string): string {
  return `${pubkeyOrNpub.slice(0, 10)}…${pubkeyOrNpub.slice(-4)}`;
}
