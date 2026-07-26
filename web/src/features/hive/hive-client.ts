/**
 * Live NIP-29 client for the Hive: one WebSocket, NIP-42 auth with the
 * member's persistent key, long-lived subscriptions, and publish-with-OK.
 *
 * Unlike shared/lib/nostr-client.ts (one-shot query, ephemeral identity),
 * this client stays open for the workspace session and signs everything
 * with the Hive identity.
 */

import { finalizeEvent } from "nostr-tools/pure";
import { makeAuthEvent } from "nostr-tools/nip42";
import type { HiveIdentity } from "./identity";

export interface HiveEvent {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
}

type SubHandler = (event: HiveEvent, live: boolean) => void;

interface Sub {
  filter: Record<string, unknown>;
  onEvent: SubHandler;
  onEose?: () => void;
  eosed: boolean;
}

export type HiveStatus =
  | { state: "connecting" }
  | { state: "ready" }
  | { state: "rejected"; reason: string }
  | { state: "closed" };

export class HiveClient {
  private ws: WebSocket | null = null;
  private subs = new Map<string, Sub>();
  private pendingOk = new Map<
    string,
    { resolve: () => void; reject: (e: Error) => void }
  >();
  private subSeq = 0;
  private authed = false;
  private closedByUser = false;

  constructor(
    private url: string,
    private identity: HiveIdentity,
    private onStatus: (status: HiveStatus) => void,
  ) {}

  connect(): void {
    this.closedByUser = false;
    this.onStatus({ state: "connecting" });
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.addEventListener("message", (msg) => this.handleMessage(msg));
    ws.addEventListener("close", () => {
      this.authed = false;
      if (!this.closedByUser) {
        this.onStatus({ state: "closed" });
      }
    });
    ws.addEventListener("error", () => {
      // close handler follows; nothing extra to do
    });
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }

  private handleMessage(msg: MessageEvent): void {
    let data: unknown;
    try {
      data = JSON.parse(String(msg.data));
    } catch {
      return;
    }
    if (!Array.isArray(data)) return;
    const [type, a, b, c] = data as [string, string, unknown, unknown];

    if (type === "AUTH" && typeof a === "string") {
      const template = makeAuthEvent(this.url, a);
      const signed = finalizeEvent(
        { ...template, created_at: Math.floor(Date.now() / 1000) },
        this.identity.secret,
      );
      this.pendingOk.set(signed.id, {
        resolve: () => {
          this.authed = true;
          this.onStatus({ state: "ready" });
          this.flushSubs();
        },
        reject: (e) => this.onStatus({ state: "rejected", reason: e.message }),
      });
      this.ws?.send(JSON.stringify(["AUTH", signed]));
      return;
    }

    if (type === "OK" && typeof a === "string") {
      const pending = this.pendingOk.get(a);
      if (pending) {
        this.pendingOk.delete(a);
        if (b === true) pending.resolve();
        else
          pending.reject(
            new Error(typeof c === "string" ? c : "Rejected by the relay."),
          );
      }
      return;
    }

    if (type === "EVENT" && typeof a === "string" && b) {
      const sub = this.subs.get(a);
      if (sub) sub.onEvent(b as HiveEvent, sub.eosed);
      return;
    }

    if (type === "EOSE" && typeof a === "string") {
      const sub = this.subs.get(a);
      if (sub && !sub.eosed) {
        sub.eosed = true;
        sub.onEose?.();
      }
      return;
    }

    if (type === "CLOSED" && typeof a === "string") {
      this.subs.delete(a);
    }
  }

  private flushSubs(): void {
    for (const [id, sub] of this.subs) {
      this.ws?.send(JSON.stringify(["REQ", id, sub.filter]));
    }
  }

  /** Open a live subscription. Returns an unsubscribe function. */
  subscribe(
    filter: Record<string, unknown>,
    onEvent: SubHandler,
    onEose?: () => void,
  ): () => void {
    const id = `hive-${++this.subSeq}`;
    this.subs.set(id, { filter, onEvent, onEose, eosed: false });
    if (this.authed) {
      this.ws?.send(JSON.stringify(["REQ", id, filter]));
    }
    return () => {
      this.subs.delete(id);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(["CLOSE", id]));
      }
    };
  }

  /** Sign and publish an event; resolves when the relay OKs it. */
  publish(kind: number, content: string, tags: string[][]): Promise<HiveEvent> {
    const event = finalizeEvent(
      { kind, content, tags, created_at: Math.floor(Date.now() / 1000) },
      this.identity.secret,
    );
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingOk.delete(event.id);
        reject(new Error("The relay didn't answer in time."));
      }, 10_000);
      this.pendingOk.set(event.id, {
        resolve: () => {
          clearTimeout(timer);
          resolve(event as HiveEvent);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws?.send(JSON.stringify(["EVENT", event]));
    });
  }
}
