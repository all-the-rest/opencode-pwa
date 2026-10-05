import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { listMessages } from "../lib/opencode.ts";
import { useServers } from "../state/servers.tsx";

interface MessageRow {
  id: string;
  role: string;
  text: string;
}

function extractMessages(value: unknown): MessageRow[] {
  if (value === null || typeof value !== "object") return [];
  const record = value as { data?: unknown; messages?: unknown };
  const list = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.messages)
      ? record.messages
      : [];
  return list.map((entry, index) => {
    if (entry !== null && typeof entry === "object") {
      const r = entry as Record<string, unknown>;
      const id = typeof r["id"] === "string" ? r["id"] : `nachricht-${index}`;
      const role = typeof r["role"] === "string" ? r["role"] : "unbekannt";
      const text =
        typeof r["text"] === "string"
          ? r["text"]
          : typeof r["content"] === "string"
            ? r["content"]
            : JSON.stringify(r).slice(0, 500);
      return { id, role, text };
    }
    return { id: `nachricht-${index}`, role: "unbekannt", text: String(entry) };
  });
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { servers, selectedServer } = useServers();
  const serverId = searchParams.get("server") ?? selectedServer?.id ?? null;
  const server = servers.find((s) => s.id === serverId) ?? selectedServer;

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (server === null || server === undefined || id === undefined) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listMessages(server, id)
      .then((res) => {
        if (cancelled) return;
        if (res.error !== null) {
          setError(res.error);
          setMessages([]);
          return;
        }
        setMessages(extractMessages(res.data));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [server, id]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Session</h1>
      <p className="text-sm opacity-70 font-mono break-all">{id}</p>
      {server === null || server === undefined ? (
        <div className="alert alert-info">
          <span>Kein Server ausgewählt. Wähle oben einen Server.</span>
        </div>
      ) : (
        <>
          <p className="text-sm opacity-70">Server: {server.name}</p>
          {loading && <span className="loading loading-spinner loading-md" aria-label="Lädt" />}
          {error !== null && (
            <div className="alert alert-warning">
              <span>Nachrichten konnten nicht geladen werden (offline?): {error}</span>
            </div>
          )}
          {!loading && error === null && (
            <ul className="flex flex-col gap-2">
              {messages.length === 0 && (
                <li className="opacity-70 text-sm">Keine Nachrichten vorhanden.</li>
              )}
              {messages.map((m) => (
                <li key={m.id} className="chat chat-start">
                  <div className="chat-header text-xs opacity-70 mb-1">{m.role}</div>
                  <div className="chat-bubble chat-bubble-neutral whitespace-pre-wrap break-words">
                    {m.text}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2 sticky bottom-4"
            onSubmit={(e) => {
              e.preventDefault();
              // Read-only MVP: sending is deferred (see AGENTS.todo.md).
              setDraft("");
            }}
          >
            <input
              className="input input-bordered flex-1"
              placeholder="Nachricht schreiben (MVP: nur lesen)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Nachricht schreiben"
              disabled
            />
            <button className="btn btn-primary" type="submit" disabled title="Senden folgt nach MVP">
              Senden
            </button>
          </form>
          <p className="text-xs opacity-60">MVP ist lesend: Senden ist deaktiviert.</p>
        </>
      )}
    </div>
  );
}
