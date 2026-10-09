import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import Icon from "./Icon.tsx";
import ServerDot from "./ServerDot.tsx";
import { useTickingNow } from "../hooks/useTickingNow.ts";
import type { RunningWork, RunningAgent } from "../hooks/useRunningWork.ts";
import { formatStartedAt, runtimeLabel } from "../lib/runtimeFormat.ts";
import { resolveModelLabel } from "../lib/sessionMessages.ts";
import type { ServerConfig } from "../lib/opencode.ts";

/**
 * Compact "what is running right now" strip directly above the composer
 * (owner requirement, wave 6): the open server's running shells, live PTYs and
 * its other executing sessions ("subagents") — each with a ticking elapsed
 * runtime, so "wie lange läuft das" is answerable at a glance, on desktop and
 * on mobile.
 *
 * Mobile shows the essentials (server dot, kind, label, runtime); from `lg`
 * up the rows also carry the start time, the agent · model and the project.
 * Subagent rows are tap targets that open the session through the existing tab
 * mechanism; shells and PTYs have no session to navigate to and stay inert.
 *
 * Renders NOTHING while no work runs — no reserved chat space, and (see
 * `useTickingNow`) no timer either.
 */
export default function SessionRunStrip({
  server,
  work,
  modelNames = {},
  onOpenSession,
}: {
  server: ServerConfig;
  work: RunningWork;
  /** `provider/model` → display name, so the detail line shows the model name. */
  modelNames?: Readonly<Record<string, string>>;
  onOpenSession: (agent: RunningAgent) => void;
}) {
  const count = work.shells.length + work.ptys.length + work.agents.length;
  const now = useTickingNow(count > 0);
  if (count === 0) return null;

  const serverDots = <ServerDot server={server} />;
  const total = count === 1 ? t`1 Ausführung` : t`${count} Ausführungen`;

  return (
    <section
      className="card rounded-xl border border-base-300 bg-base-200/60 p-2 oc-dense"
      aria-label={t`Laufende Ausführungen`}
      data-testid="session-run-strip"
      data-running-count={count}
    >
      <p className="oc-micro uppercase tracking-wide opacity-60 px-1 pb-1 flex items-center gap-1">
        <Icon name="refresh" className="size-3" />
        <Trans>Läuft</Trans>
        <span aria-hidden="true">·</span>
        <span className="oc-tabular">{total}</span>
      </p>
      <ul className="flex flex-col gap-1">
        {work.shells.map((shell) => (
          <li
            key={`shell-${shell.id}`}
            className="flex items-center gap-2 min-w-0"
            data-testid={`run-strip-shell-${shell.id}`}
          >
            {serverDots}
            <Icon name="shell" className="shrink-0 opacity-70" />
            <span className="truncate flex-1 min-w-0 font-mono" title={shell.command}>
              {shell.command}
            </span>
            <RuntimeValue
              testid={`run-strip-runtime-shell-${shell.id}`}
              startedAt={shell.startedAt}
              now={now}
            />
          </li>
        ))}
        {work.ptys.map((pty) => {
          const label = pty.title ?? t`Terminal`;
          return (
            <li
              key={`pty-${pty.id}`}
              className="flex items-center gap-2 min-w-0"
              data-testid={`run-strip-pty-${pty.id}`}
            >
              {serverDots}
              <Icon name="pty" className="shrink-0 opacity-70" />
              <span className="truncate flex-1 min-w-0" title={label}>
                {label}
              </span>
              <RuntimeValue
                testid={`run-strip-runtime-pty-${pty.id}`}
                startedAt={pty.startedAt}
                now={now}
              />
            </li>
          );
        })}
        {work.agents.map((agent) => {
          const model = resolveModelLabel(agent.model, modelNames);
          // Lingui-safe hoists: no member access or calls inside messages.
          const agentTitle = agent.title;
          const openLabel = t`Session ${agentTitle} öffnen`;
          const detail = [agent.agent, model].filter((value): value is string => value !== null);
          const startedAt = formatStartedAt(agent.startedAt);
          return (
            <li key={`agent-${agent.sessionID}`} className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                className="flex items-center gap-2 min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left hover:bg-base-300/60"
                aria-label={openLabel}
                data-testid={`run-strip-agent-${agent.sessionID}`}
                onClick={() => onOpenSession(agent)}
              >
                {serverDots}
                <Icon name="session" className="shrink-0 opacity-70" />
                <span className="truncate min-w-0 flex-1" title={agentTitle}>
                  {agentTitle}
                </span>
                {/* Desktop extras: start time, agent · model, project. */}
                {startedAt !== null && (
                  <span className="hidden lg:inline oc-micro opacity-60 shrink-0">
                    <Trans>seit {startedAt}</Trans>
                  </span>
                )}
                {detail.length > 0 && (
                  <span className="hidden lg:inline oc-micro opacity-60 truncate max-w-48 shrink-0">
                    {detail.join(" · ")}
                  </span>
                )}
                {agent.projectKey !== null && agent.projectKey !== "" && (
                  <span className="hidden lg:inline oc-micro opacity-50 truncate max-w-40 shrink-0">
                    {agent.projectKey}
                  </span>
                )}
                <RuntimeValue
                  testid={`run-strip-runtime-${agent.sessionID}`}
                  startedAt={agent.startedAt}
                  now={now}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Ticking elapsed runtime of one row (nothing when no start is known). */
function RuntimeValue({
  testid,
  startedAt,
  now,
}: {
  testid: string;
  startedAt: number | null;
  now: number;
}) {
  const label = runtimeLabel(startedAt, now);
  if (label === null) return null;
  return (
    <span className="oc-micro oc-tabular opacity-80 shrink-0" data-testid={testid}>
      {label}
    </span>
  );
}
