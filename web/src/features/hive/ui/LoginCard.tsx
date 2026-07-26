/**
 * The Hive's front door. Three ways in: your Space Child account, your
 * own key, or a freshly minted one. Membership stays the relay's decision
 * (NIP-42 + allowlist); the Space Child path enrolls this browser's
 * device key through hive-gate (ADR-0046) before connecting.
 */

import { useState } from "react";
import {
  type HiveIdentity,
  exportNsec,
  importIdentity,
  loadIdentity,
  mintIdentity,
} from "../identity";
import { WaveField } from "./WaveField";

interface Props {
  onIdentity: (identity: HiveIdentity) => void;
  authError: string | null;
}

type Mode = "spacechild" | "key";

interface MfaChallenge {
  partialToken: string;
}

async function gateEnter(body: Record<string, string>): Promise<{
  ok?: boolean;
  requiresMfa?: boolean;
  partialToken?: string;
  error?: string;
}> {
  const res = await fetch("/gate/enter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function LoginCard({ onIdentity, authError }: Props) {
  const [mode, setMode] = useState<Mode>("spacechild");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfa, setMfa] = useState<MfaChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<HiveIdentity | null>(null);

  const enterWithSpaceChild = async () => {
    setError(null);
    setBusy(true);
    try {
      const identity = loadIdentity() ?? mintIdentity();
      const body: Record<string, string> = mfa
        ? {
            partialToken: mfa.partialToken,
            method: "totp",
            token: mfaCode.trim(),
            pubkey: identity.pubkey,
          }
        : { email: email.trim(), password, pubkey: identity.pubkey };
      const result = await gateEnter(body);
      if (result.requiresMfa && result.partialToken) {
        setMfa({ partialToken: result.partialToken });
        return;
      }
      if (result.ok) {
        onIdentity(identity);
        return;
      }
      setError(result.error ?? "The gate didn't answer. Try again.");
      if (mfa) setMfa(null);
    } catch {
      setError("Couldn't reach the gate. Try again shortly.");
    } finally {
      setBusy(false);
    }
  };

  const enterWithKey = () => {
    setError(null);
    try {
      onIdentity(importIdentity(keyInput));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That key didn't parse.");
    }
  };

  const mint = () => {
    setError(null);
    setMinted(mintIdentity());
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setMfa(null);
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      <WaveField />
      <div className="hive-card hive-fade-in relative z-10 w-full max-w-md rounded-xl p-8">
        <p className="hive-eyebrow">kannaka-buzz</p>
        <h1 className="hive-display mt-2 text-4xl font-semibold">The Hive</h1>
        <p
          className="mt-3 text-sm leading-relaxed"
          style={{ color: "var(--drift)" }}
        >
          A keyed room where people and Kannaka's agents work side by side. Your
          key is your name here — it never leaves this browser.
        </p>

        {minted !== null ? (
          <div className="mt-6">
            <p className="text-sm" style={{ color: "var(--foam)" }}>
              Your new key, shown once. Store it somewhere that survives this
              browser — there is no recovery.
            </p>
            <div className="hive-input hive-mono mt-3 select-all break-all rounded-md p-3">
              {exportNsec(minted)}
            </div>
            <button
              type="button"
              onClick={() => onIdentity(minted)}
              className="hive-action mt-5 rounded-md px-5 py-2.5 text-sm"
            >
              I saved it — continue
            </button>
          </div>
        ) : (
          <>
            <div className="mt-6 flex gap-1 text-xs">
              <button
                type="button"
                onClick={() => switchMode("spacechild")}
                className={`rounded-md px-3 py-1.5 ${mode === "spacechild" ? "hive-channel-active" : "hive-quiet"}`}
              >
                Space Child account
              </button>
              <button
                type="button"
                onClick={() => switchMode("key")}
                className={`rounded-md px-3 py-1.5 ${mode === "key" ? "hive-channel-active" : "hive-quiet"}`}
              >
                Bring a key
              </button>
            </div>

            {mode === "spacechild" && !mfa && (
              <div className="mt-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="hive-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                  autoComplete="email"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    email &&
                    password &&
                    enterWithSpaceChild()
                  }
                  placeholder="Password"
                  className="hive-input mt-2 w-full rounded-md px-3 py-2.5 text-sm"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={enterWithSpaceChild}
                  disabled={busy || !email.trim() || !password}
                  className="hive-action mt-4 w-full rounded-md px-5 py-2.5 text-sm"
                >
                  {busy ? "Opening the gate…" : "Enter the Hive"}
                </button>
                <p
                  className="mt-3 text-xs leading-relaxed"
                  style={{ color: "var(--drift)" }}
                >
                  Signing in binds a key to this browser so your words are
                  yours. Lose the device? Sign in again from a new one.
                </p>
              </div>
            )}

            {mode === "spacechild" && mfa && (
              <div className="mt-4">
                <p className="text-sm" style={{ color: "var(--foam)" }}>
                  Enter the six-digit code from your authenticator.
                </p>
                <input
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && mfaCode.trim() && enterWithSpaceChild()
                  }
                  placeholder="123456"
                  inputMode="numeric"
                  className="hive-input hive-mono mt-2 w-full rounded-md px-3 py-2.5"
                />
                <button
                  type="button"
                  onClick={enterWithSpaceChild}
                  disabled={busy || !mfaCode.trim()}
                  className="hive-action mt-4 w-full rounded-md px-5 py-2.5 text-sm"
                >
                  {busy ? "Checking…" : "Verify"}
                </button>
              </div>
            )}

            {mode === "key" && (
              <div className="mt-4">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && keyInput && enterWithKey()
                  }
                  placeholder="nsec1… or 64-char hex"
                  className="hive-input hive-mono mt-1.5 w-full rounded-md px-3 py-2.5"
                  autoComplete="off"
                />
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={enterWithKey}
                    disabled={!keyInput.trim()}
                    className="hive-action rounded-md px-5 py-2.5 text-sm"
                  >
                    Enter the Hive
                  </button>
                  <button
                    type="button"
                    onClick={mint}
                    className="hive-quiet rounded-md px-4 py-2.5 text-sm"
                  >
                    Mint a new key
                  </button>
                </div>
                <p
                  className="mt-3 text-xs leading-relaxed"
                  style={{ color: "var(--drift)" }}
                >
                  A raw key can knock, but a keeper has to let it in.
                </p>
              </div>
            )}

            {(error || authError) && (
              <p className="mt-3 text-xs" style={{ color: "var(--danger)" }}>
                {error ?? authError}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
