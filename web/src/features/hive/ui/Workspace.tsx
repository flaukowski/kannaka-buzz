/**
 * The Hive workspace: channels on the left, the room on the right.
 * Channels are NIP-29 groups (kind 39000 metadata, kind 9007 create,
 * kind 9 messages under an #h tag), served live by our own relay.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { HiveClient, HiveEvent } from "../hive-client";
import type { HiveIdentity } from "../identity";
import { displayName, useProfiles } from "../profiles";
import { useMembers, useReactions, useTyping } from "../room-hooks";
import { StatusLine } from "./StatusLine";

const QUICK_REACTIONS = ["👍", "🔥", "🐝", "🤯", "❤️"];
const AGENT_PUBKEY =
  "038fafe28608b3eda36912d30483fd07953713eb0601cc8d98b20eb8126c67a6";

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
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTypingRef = useRef(0);
  const profiles = useProfiles(client);
  const me = displayName(identity.pubkey, profiles, identity.pubkey);
  const typing = useTyping(client, activeId, identity.pubkey);
  const reactions = useReactions(client, activeId, identity.pubkey);
  const members = useMembers(client, activeId);

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

  const forgetChannel = useCallback((id: string) => {
    setChannels((prev) => {
      const next = new Map(prev);
      next.delete(id);
      setActiveId((cur) =>
        cur === id ? (next.keys().next().value ?? null) : cur,
      );
      return next;
    });
  }, []);

  const deleteChannel = useCallback(
    async (id: string, name: string) => {
      if (!window.confirm(`Delete #${name}? This removes it for everyone.`))
        return;
      try {
        await client.publish(9008, "", [["h", id]]);
        forgetChannel(id);
      } catch (e) {
        setSendError(
          e instanceof Error
            ? `Couldn't delete #${name}: ${e.message}`
            : "Delete failed.",
        );
      }
    },
    [client, forgetChannel],
  );

  const leaveChannel = useCallback(
    async (id: string, name: string) => {
      try {
        await client.publish(9022, "", [["h", id]]);
        forgetChannel(id);
      } catch (e) {
        setSendError(
          e instanceof Error
            ? `Couldn't leave #${name}: ${e.message}`
            : "Leave failed.",
        );
      }
    },
    [client, forgetChannel],
  );

  const react = useCallback(
    async (messageId: string, emoji: string) => {
      if (!activeId) return;
      try {
        await client.publish(7, emoji, [
          ["e", messageId],
          ["h", activeId],
        ]);
      } catch {
        /* reaction is best-effort */
      }
    },
    [client, activeId],
  );

  const onDraftChange = useCallback(
    (value: string) => {
      setDraft(value);
      const now = Date.now();
      if (activeId && value && now - lastTypingRef.current > 3000) {
        lastTypingRef.current = now;
        client.publish(20002, "", [["h", activeId]]).catch(() => {});
      }
    },
    [client, activeId],
  );

  const saveName = useCallback(async () => {
    const name = nameDraft.trim();
    if (!name) return;
    try {
      await client.publish(
        0,
        JSON.stringify({
          name,
          about: me.name && me.name !== "anon" ? undefined : "",
        }),
        [],
      );
      setEditingName(false);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Couldn't set your name.");
    }
  }, [client, nameDraft, me.name]);

  const channelList = useMemo(
    () => [...channels.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [channels],
  );
  const active = activeId ? channels.get(activeId) : null;
  const msgAuthor = useMemo(() => {
    const m = new Map<string, string>();
    for (const msg of messages) m.set(msg.id, msg.pubkey);
    return m;
  }, [messages]);
  const typingLine = useMemo(() => {
    if (typing.length === 0) return null;
    const names = typing.map(
      (pk) => displayName(pk, profiles, identity.pubkey).name,
    );
    const verb =
      names.length === 1 && names[0] === "Kannaka"
        ? "is thinking"
        : "is typing";
    if (names.length === 1) return `${names[0]} ${verb}…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return `${names.length} people are typing…`;
  }, [typing, profiles, identity.pubkey]);

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
          {editingName ? (
            <span className="flex items-center gap-1">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                placeholder="Your name"
                className="hive-input rounded-md px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={saveName}
                className="hive-action rounded-md px-2 py-1 text-xs"
              >
                Save
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNameDraft(me.name !== "anon" ? me.name : "");
                setEditingName(true);
              }}
              className="text-xs"
              title="Set your display name"
            >
              <span style={{ color: "var(--foam)" }}>
                {me.name !== "anon" ? me.name : "set name"}
              </span>
              <span className="hive-key-tag hive-mono"> ·{me.tag}</span>
            </button>
          )}
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
              <div
                key={channel.id}
                className={`hive-channel-row px-4 py-2 text-sm ${
                  channel.id === activeId ? "hive-channel-active" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(channel.id)}
                  className="min-w-0 flex-1 truncate text-left"
                  style={
                    channel.id === activeId
                      ? undefined
                      : { color: "var(--drift)" }
                  }
                >
                  {channel.name}
                </button>
                <span className="hive-channel-tools flex gap-1">
                  <button
                    type="button"
                    title="Leave channel"
                    onClick={() => leaveChannel(channel.id, channel.name)}
                    className="hive-icon-btn"
                  >
                    ↩
                  </button>
                  <button
                    type="button"
                    title="Delete channel (owner only)"
                    onClick={() => deleteChannel(channel.id, channel.name)}
                    className="hive-icon-btn"
                  >
                    ✕
                  </button>
                </span>
              </div>
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
            className="flex items-center justify-between border-b px-5 py-2.5 text-sm font-medium"
            style={{ borderColor: "var(--line)" }}
          >
            <span>
              {active ? active.name : "—"}
              {active?.about && (
                <span
                  className="ml-3 text-xs font-normal"
                  style={{ color: "var(--drift)" }}
                >
                  {active.about}
                </span>
              )}
            </span>
            {active && members.length > 0 && (
              <span
                className="hive-mono text-xs"
                style={{ color: "var(--drift)" }}
                title={members
                  .map((pk) => displayName(pk, profiles, identity.pubkey).name)
                  .join(", ")}
              >
                {members.length} {members.length === 1 ? "member" : "members"}
                {members.some((pk) => pk === AGENT_PUBKEY) && (
                  <span style={{ color: "var(--phase)" }}> · Kannaka here</span>
                )}
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
                  {(() => {
                    const who = displayName(
                      message.pubkey,
                      profiles,
                      identity.pubkey,
                    );
                    return (
                      <span className="flex items-baseline gap-1">
                        <span
                          style={{
                            color: who.isSelf ? "var(--honey)" : "var(--phase)",
                            fontWeight: 500,
                          }}
                        >
                          {who.isSelf ? "you" : who.name}
                        </span>
                        <span className="hive-key-tag hive-mono">
                          ·{who.tag}
                        </span>
                      </span>
                    );
                  })()}
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
                  {(() => {
                    const replyTo = message.tags.find(
                      (t) => t[0] === "e" && t[3] === "reply",
                    )?.[1];
                    const parentPk = replyTo && msgAuthor.get(replyTo);
                    if (!parentPk) return null;
                    return (
                      <span
                        className="text-[0.65rem]"
                        style={{ color: "var(--drift)" }}
                      >
                        ↪{" "}
                        {displayName(parentPk, profiles, identity.pubkey).name}
                      </span>
                    );
                  })()}
                </div>
                <div className="hive-msg-body mt-0.5 break-words text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
                <div className="hive-msg-reactions mt-1 flex items-center gap-1">
                  {(() => {
                    const r = reactions.get(message.id);
                    return r
                      ? Object.entries(r.counts).map(([emoji, count]) => (
                          <button
                            type="button"
                            key={emoji}
                            onClick={() => react(message.id, emoji)}
                            className={`hive-reaction-pill ${r.mine.has(emoji) ? "hive-reaction-mine" : ""}`}
                          >
                            {emoji} {count}
                          </button>
                        ))
                      : null;
                  })()}
                  <span className="hive-reaction-add">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        type="button"
                        key={emoji}
                        onClick={() => react(message.id, emoji)}
                        className="hive-reaction-quick"
                        title={`React ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </span>
                </div>
              </div>
            ))}
            {typingLine && (
              <p
                className="hive-typing text-xs"
                style={{ color: "var(--phase)" }}
              >
                {typingLine}
              </p>
            )}
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
              onChange={(e) => onDraftChange(e.target.value)}
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

      <StatusLine client={client} />
    </div>
  );
}
