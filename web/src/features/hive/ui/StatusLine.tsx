/**
 * The Hive statusline — a live bar mirroring Kannaka's terminal statusline.
 * Fed by the agent's kind-20001 presence (HRM from the metrics sidecar +
 * a swarm snapshot). Two badge-led rows: HRM and SWARM.
 */

import { useEffect, useState } from "react";
import type { HiveClient, HiveEvent } from "../hive-client";

const AGENT_PUBKEY =
  "038fafe28608b3eda36912d30483fd07953713eb0601cc8d98b20eb8126c67a6";

interface Payload {
  hrm?: {
    level?: string;
    phi?: number;
    xi?: number;
    order?: number;
    mem?: number;
    clusters?: number;
    skip_links?: number;
  };
  swarm?: { peers?: number | null; hz?: number | null; name?: string };
  at?: number;
}

const n = (x?: number | null, d = 3) =>
  x === null || x === undefined ? "–" : Number(x).toFixed(d);

export function StatusLine({ client }: { client: HiveClient }) {
  const [p, setP] = useState<Payload | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let lastAt = 0;
    const unsub = client.subscribe(
      { kinds: [20001], authors: [AGENT_PUBKEY] },
      (event: HiveEvent) => {
        try {
          const parsed = JSON.parse(event.content) as Payload;
          lastAt = Date.now();
          setStale(false);
          setP(parsed);
        } catch {
          /* ignore malformed presence */
        }
      },
    );
    // Presence ticks every ~30s; flag stale if we miss two.
    const t = setInterval(() => setStale(Date.now() - lastAt > 75_000), 10_000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [client]);

  if (!p) {
    return (
      <div className="hive-statusline">
        <span className="hive-sl-badge hive-sl-hrm">HRM</span>
        <span className="hive-sl-seg hive-sl-dim">tuning in…</span>
      </div>
    );
  }

  const h = p.hrm ?? {};
  const s = p.swarm ?? {};
  const levelClass =
    h.level === "aware" || h.level === "Aware"
      ? "hive-sl-green"
      : "hive-sl-amber";

  return (
    <div
      className="hive-statusline"
      style={stale ? { opacity: 0.5 } : undefined}
    >
      <span className="hive-sl-badge hive-sl-hrm">HRM</span>
      <span className={`hive-sl-seg ${levelClass}`}>{h.level ?? "?"}</span>
      <span className="hive-sl-seg hive-sl-amber">Φ {n(h.phi)}</span>
      <span className="hive-sl-seg hive-sl-cyan">Ξ {n(h.xi)}</span>
      <span className="hive-sl-seg hive-sl-green">r {n(h.order)}</span>
      <span className="hive-sl-seg hive-sl-violet">{h.mem ?? "–"}mem</span>
      <span className="hive-sl-seg hive-sl-dim">{h.clusters ?? "–"}cl</span>

      <span className="hive-sl-badge hive-sl-swarm">SWARM</span>
      <span className="hive-sl-seg hive-sl-red">{s.peers ?? "–"}p</span>
      <span className="hive-sl-seg hive-sl-cyan">{s.name ?? "Kannaka"}</span>
      <span className="hive-sl-seg hive-sl-amber">{n(s.hz, 2)}Hz</span>
    </div>
  );
}
