/**
 * The Hive: Kannaka's browser client for kannaka-buzz.
 * Owns the identity + relay-connection lifecycle; renders the door
 * or the room.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { HiveClient, type HiveStatus } from "../hive-client";
import { type HiveIdentity, clearIdentity, loadIdentity } from "../identity";
import { LoginCard } from "./LoginCard";
import { Workspace } from "./Workspace";
import "./hive.css";

export function HivePage() {
  const [identity, setIdentity] = useState<HiveIdentity | null>(() =>
    loadIdentity(),
  );
  const [status, setStatus] = useState<HiveStatus>({ state: "connecting" });
  const clientRef = useRef<HiveClient | null>(null);

  useEffect(() => {
    if (!identity) return;
    const client = new HiveClient(relayWsUrl(), identity, setStatus);
    clientRef.current = client;
    client.connect();
    return () => {
      clientRef.current = null;
      client.close();
    };
  }, [identity]);

  const leave = useCallback(() => {
    clearIdentity();
    setIdentity(null);
    setStatus({ state: "connecting" });
  }, []);

  if (!identity || status.state === "rejected") {
    const authError =
      status.state === "rejected"
        ? `This key isn't a member of the Hive yet (${status.reason}). ` +
          "Ask a keeper to allowlist it, or enter with a member key."
        : null;
    return (
      <div className="hive-root">
        <LoginCard
          onIdentity={(next) => {
            setStatus({ state: "connecting" });
            setIdentity(next);
          }}
          authError={authError}
        />
      </div>
    );
  }

  if (status.state !== "ready") {
    return (
      <div className="hive-root flex min-h-dvh items-center justify-center">
        <p className="hive-eyebrow">
          {status.state === "closed"
            ? "connection lost — reload to rejoin"
            : "tuning in…"}
        </p>
      </div>
    );
  }

  return (
    <div className="hive-root">
      <Workspace
        client={clientRef.current as HiveClient}
        identity={identity}
        onLeave={leave}
      />
    </div>
  );
}
