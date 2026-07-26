/**
 * The Hive's front door. Two ways in: bring your key, or mint one.
 * Membership stays the relay's decision (NIP-42 + allowlist) — this
 * card is honest about that when a key is turned away.
 */

import { useState } from "react";
import {
  type HiveIdentity,
  importIdentity,
  mintIdentity,
  exportNsec,
} from "../identity";
import { WaveField } from "./WaveField";

interface Props {
  onIdentity: (identity: HiveIdentity) => void;
  authError: string | null;
}

export function LoginCard({ onIdentity, authError }: Props) {
  const [keyInput, setKeyInput] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [minted, setMinted] = useState<HiveIdentity | null>(null);

  const enter = () => {
    setImportError(null);
    try {
      onIdentity(importIdentity(keyInput));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "That key didn't parse.");
    }
  };

  const mint = () => {
    setImportError(null);
    setMinted(mintIdentity());
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

        {minted === null ? (
          <>
            <label className="mt-6 block">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--drift)" }}
              >
                Your key (nsec or hex)
              </span>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && keyInput && enter()}
                placeholder="nsec1…"
                className="hive-input hive-mono mt-1.5 w-full rounded-md px-3 py-2.5"
                autoComplete="off"
              />
            </label>
            {importError && (
              <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
                {importError}
              </p>
            )}
            {authError && (
              <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
                {authError}
              </p>
            )}
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={enter}
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
              className="mt-6 text-xs leading-relaxed"
              style={{ color: "var(--drift)" }}
            >
              This Hive is invitation-only. A new key can knock, but a keeper
              has to let it in.
            </p>
          </>
        ) : (
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
        )}
      </div>
    </div>
  );
}
