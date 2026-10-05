import { OpenCode } from "@opencode/client";

export interface ServerConfig {
  id: string;
  name: string;
  baseUrl: string;
  username: string;
  password: string;
}

export type OpencodeClient = ReturnType<typeof OpenCode.make>;

export function basicAuthHeader(server: Pick<ServerConfig, "username" | "password">): string {
  return `Basic ${btoa(`${server.username}:${server.password}`)}`;
}

export function makeClient(server: ServerConfig): OpencodeClient {
  const headers: Record<string, string> = {};
  if (server.username !== "" || server.password !== "") {
    headers["Authorization"] = basicAuthHeader(server);
  }
  const normalizedBaseUrl = server.baseUrl.replace(/\/$/, "");
  return OpenCode.make({
    baseUrl: normalizedBaseUrl,
    headers,
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unbekannter Fehler";
}

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

async function guarded<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: toErrorMessage(error) };
  }
}

export function getServerInfo(server: ServerConfig) {
  return guarded(() => makeClient(server).server.info());
}

export function listSessions(server: ServerConfig) {
  return guarded(() => makeClient(server).session.list());
}

export function listShells(server: ServerConfig) {
  // GET /api/shell
  return guarded(() => makeClient(server).shell.list());
}

export function listPtys(server: ServerConfig) {
  // GET /api/pty
  return guarded(() => makeClient(server).pty.list());
}

export function listAgents(server: ServerConfig) {
  return guarded(() => makeClient(server).agent.list());
}

export function listMessages(server: ServerConfig, sessionID: string) {
  return guarded(() => makeClient(server).message.list({ sessionID }));
}

export async function* subscribeEvents(
  server: ServerConfig,
  signal: AbortSignal,
): AsyncGenerator<unknown, void, void> {
  const client = makeClient(server);
  const stream = client.event.subscribe({ signal });
  for await (const event of stream) {
    yield event;
  }
}
