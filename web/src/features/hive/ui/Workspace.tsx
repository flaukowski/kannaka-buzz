/**
 * The Hive workspace: channels on the left, the room on the right.
 * Channels are NIP-29 groups (kind 39000 metadata, kind 9007 create,
 * kind 9 messages under an #h tag), served live by our own relay.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HiveClient, HiveEvent } from "../hive-client";
import { type HiveIdentity, shortKey } from "../identity";

interface Channel {
  id: string;
  name: string;
  about: string | null;
}

interface Props {
  client: HiveClient;
  identity: HiveIdentity;
  onLeave: () => void;
}

function parseChannel(event: HiveEvent): Channel | null {
  let id: string | null = null;
  let name: string | null = null;
  let about: string | null = null;
  let hidden = false;
  for (const tag of event.tags) {
    if (tag[0] === "d" && tag[1]) id = tag[1];
    if (tag[0] === "name" && tag[1]) name = tag[1];
    if (tag[0] === "about" && tag[1]) about = tag[1];
    if (tag[0] === "hidden") hidden = true;
  }
  if (!id || !name || hidden) return null;
  return { id, name, about };
}

export function Workspace({ client, identity, onLeave }: Props) {
  const [channels, setChannels] = useState<Map<string, Channel>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<HiveEvent[]>([]);
  const [draft, setDraft] = useState("");
  const [newChannel, setNewChannel] = useState("");
  const [creating, setCreating] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Channel discovery: relay-signed group metadata, live.
  useEffect(() => {
    return client.subscribe({ kinds: [39000], limit: 200 }, (event) => {
      const channel = parseChannel(event);
      if (!channel) return;
      setChannels((prev) => {
        const next = new Map(prev);
        next.set(channel.id, channel);
        return next;
      });
      setActiveId((current) => current ?? channel.id);
    });
  }, [client]);

  // Message stream for the active channel.
  useEffect(() => {
    if (!activeId) return;
    setMessages([]);
    return client.subscribe(
      { kinds: [9], "#h": [activeId], limit: 100 },
      (event) => {
        setMessages((prev) =>
          prev.some((m) => m.id === event.id)
            ? prev
            : [...prev, event].sort((x, y) => x.created_at - y.created_at),
        );
      },
    );
  }, [client, activeId]);

  useEffect(() => {
    if (messages.length === 0) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !activeId) return;
    setSendError(null);
    setDraft("");
    try {
      await client.publish(9, text, [["h", activeId]]);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "The relay refused that.");
      setDraft(text);
    }
  }, [client, draft, activeId]);

  const createChannel = useCallback(async () => {
    const name = newChannel.trim();
    if (!name) return;
    setCreating(true);
    try {
      await client.publish(9007, "", [
        ["name", name],
        ["visibility", "open"],
      ]);
      setNewChannel("");
    } catch {
      // The discovery sub will simply not show it; keep the name for retry.
    } finally {
      setCreating(false);
    }
  }, [client, newChannel]);

  const channelList = useMemo(
    () => [...channels.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [channels],
  );
  const active = activeId ? channels.get(activeId) : null;

  return (
    <div className="flex h-dvh flex-col">
      <header
        className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex items-baseline gap-3">
          <span className="hive-display text-lg font-semibold">The Hive</span>
          <span className="hive-eyebrow">kannaka-buzz</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hive-live-dot" title="Connected" />
          <span className="hive-mono" style={{ color: "var(--drift)" }}>
            {shortKey(identity.npub)}
          </span>
          <button
            type="button"
            onClick={onLeave}
            className="hive-quiet rounded-md px-3 py-1.5 text-xs"
          >
            Leave
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className="flex w-56 shrink-0 flex-col border-r"
          style={{ borderColor: "var(--line)", background: "var(--pane)" }}
        >
          <p className="hive-eyebrow px-4 pb-1 pt-4">Channels</p>
          <nav className="min-h-0 flex-1 overflow-y-auto py-1">
            {channelList.length === 0 && (
              <p
                className="px-4 py-2 text-xs"
                style={{ color: "var(--drift)" }}
              >
                No channels yet. Open the first one below.
              </p>
            )}
            {channelList.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onClick={() => setActiveId(channel.id)}
                className={`block w-full px-4 py-2 text-left text-sm ${
                  channel.id === activeId
                    ? "hive-channel-active"
                    : "hover:text-[var(--foam)]"
                }`}
                style={
                  channel.id === activeId
                    ? undefined
                    : { color: "var(--drift)" }
                }
              >
                {channel.name}
              </button>
            ))}
          </nav>
          <div className="border-t p-3" style={{ borderColor: "var(--line)" }}>
            <div className="flex gap-2">
              <input
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createChannel()}
                placeholder="New channel"
                className="hive-input min-w-0 flex-1 rounded-md px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={createChannel}
                disabled={creating || !newChannel.trim()}
                className="hive-action rounded-md px-2.5 py-1.5 text-xs"
              >
                Open
              </button>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div
            className="border-b px-5 py-2.5 text-sm font-medium"
            style={{ borderColor: "var(--line)" }}
          >
            {active ? active.name : "—"}
            {active?.about && (
              <span
                className="ml-3 text-xs font-normal"
                style={{ color: "var(--drift)" }}
              >
                {active.about}
              </span>
            )}
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
          >
            {messages.map((message) => (
              <div key={message.id} className="mb-3">
                <div className="flex items-baseline gap-2">
                  <span
                    className="hive-mono"
                    style={{
                      color:
                        message.pubkey === identity.pubkey
                          ? "var(--honey)"
                          : "var(--phase)",
                    }}
                  >
                    {shortKey(message.pubkey)}
                  </span>
                  <span
                    className="text-[0.65rem]"
                    style={{ color: "var(--drift)" }}
                  >
                    {new Date(message.created_at * 1000).toLocaleTimeString(
                      [],
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {message.content}
                </p>
              </div>
            ))}
            {active && messages.length === 0 && (
              <p className="text-xs" style={{ color: "var(--drift)" }}>
                Nothing here yet. Say the first thing.
              </p>
            )}
          </div>

          {sendError && (
            <p className="px-5 pb-1 text-xs" style={{ color: "var(--danger)" }}>
              {sendError}
            </p>
          )}
          <div
            className="flex gap-3 border-t px-5 py-3"
            style={{ borderColor: "var(--line)" }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={active ? `Message ${active.name}` : "Pick a channel"}
              disabled={!active}
              className="hive-input min-w-0 flex-1 rounded-md px-3 py-2.5 text-sm"
            />
            <button
              type="button"
              onClick={send}
              disabled={!active || !draft.trim()}
              className="hive-action rounded-md px-5 py-2.5 text-sm"
            >
              Send
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
