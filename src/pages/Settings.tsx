import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import {
  ensurePermission,
  getPermissionStatus,
  isNotificationSupported,
  type NotificationPermissionState,
} from "../lib/notify.ts";
import { SERVER_COLOR_PALETTE, serverColor } from "../lib/serverColor.ts";
import { normalizeServerBaseUrl } from "../lib/serverBaseUrl.ts";
import {
  connectionUnreachableMessage,
  testServerConnection,
  type ConnectionTestResult,
} from "../lib/serverConnectionTest.ts";
import { useServers } from "../state/servers.tsx";
import ServerDot from "../components/ServerDot.tsx";

interface FormState {
  name: string;
  baseUrl: string;
  username: string;
  password: string;
  color: string;
}

const emptyForm: FormState = { name: "", baseUrl: "", username: "", password: "", color: SERVER_COLOR_PALETTE[0] ?? "#3b82f6" };

export default function Settings() {
  const {
    servers,
    addServer,
    updateServer,
    removeServer,
    serverEventPrefs,
    toggleServerEventNotifications,
    credentialStorage,
  } = useServers();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    getPermissionStatus(),
  );
  const [permissionBusy, setPermissionBusy] = useState(false);
  const serverCount = servers.length;
  const memoryOnly = credentialStorage === "memory";

  async function handleEnableNotifications() {
    setPermissionBusy(true);
    try {
      setPermission(await ensurePermission());
    } finally {
      setPermissionBusy(false);
    }
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
    setTestResult(null);
  }

  /**
   * Field edits invalidate a previous connection-test result: it was measured
   * with older values and must not linger as a stale success.
   */
  function updateForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setTestResult(null);
  }

  /**
   * Deep-URL paste normalization: a pasted deep URL (session link, /api/…
   * path, PWA URL) collapses ONCE to the server origin. Manual typing stays
   * untouched in the field; the save path normalizes it too (handleSubmit +
   * `servers.tsx`), so a typed deep URL still ends in a working entry.
   */
  function handleBaseUrlPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text");
    if (pasted === "") return;
    e.preventDefault();
    updateForm({ baseUrl: normalizeServerBaseUrl(pasted) });
    // The programmatic value reset leaves the caret at position 0 — park it
    // at the end, so typing right after a paste appends instead of prepending.
    const target = e.currentTarget;
    requestAnimationFrame(() => {
      target.setSelectionRange(target.value.length, target.value.length);
    });
  }

  /**
   * Connection test before save: GET {baseUrl}/api/info with the ENTERED
   * credentials. Nothing is persisted here — the form values are used
   * directly, `addServer`/`updateServer` are never called. Save stays
   * independent: it is not disabled while a test runs and vice versa.
   */
  async function handleTestConnection() {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(
        await testServerConnection({
          baseUrl: form.baseUrl,
          username: form.username,
          password: form.password,
        }),
      );
    } catch {
      setTestResult({
        status: "unreachable",
        message: connectionUnreachableMessage(),
        version: null,
        url: null,
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const name = form.name.trim();
    // Normalize before validating: a typed deep URL (`…/api`, `…/api/info`,
    // session link) must save as the working origin, exactly like a paste.
    // `addServer`/`updateServer` normalize again at the persistence boundary.
    const baseUrl = normalizeServerBaseUrl(form.baseUrl);
    if (name === "" || baseUrl === "") {
      setFormError(t`Name und Basis-URL sind Pflichtfelder.`);
      return;
    }
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        setFormError(t`Basis-URL muss mit http:// oder https:// beginnen.`);
        return;
      }
    } catch {
      setFormError(t`Basis-URL ist ungültig.`);
      return;
    }
    const payload = {
      name,
      baseUrl,
      username: form.username.trim(),
      password: form.password,
      color: form.color,
    };
    setSaving(true);
    try {
      if (editingId === null) {
        await addServer(payload);
      } else {
        await updateServer(editingId, payload);
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  /**
   * Editing never reads the secret back: the password field stays blank, and
   * a blank field keeps the stored credential. The secret never enters the
   * DOM; dropping a stored credential is only possible by removing the
   * server. A non-blank field overwrites the stored credential on save.
   */
  function handleEdit(id: string) {
    const server = servers.find((s) => s.id === id);
    if (!server) return;
    setForm({
      name: server.name,
      baseUrl: server.baseUrl,
      username: server.username,
      password: "",
      color: serverColor(server),
    });
    setEditingId(id);
    setFormError(null);
    setTestResult(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">
        <Trans>Einstellungen</Trans>
      </h1>
      <p className="text-sm opacity-70">
        <Trans>
          Server werden lokal im Browser gespeichert: Name, Basis-URL und Benutzer im
          localStorage, das Passwort (Basic Auth) verschlüsselt mit AES-GCM in der
          IndexedDB-Datenbank. Pro Server ein Benutzer.
        </Trans>
      </p>
      {memoryOnly && (
        <div className="alert alert-warning" data-testid="vault-fallback-notice">
          <span>
            <Trans>
              Sicherer Passwortspeicher nicht verfügbar (WebCrypto oder IndexedDB fehlt).
              Passwörter bleiben nur für diese Sitzung im Arbeitsspeicher und werden nicht
              dauerhaft gespeichert. Nach einem Neuladen bitte neu eingeben.
            </Trans>
          </span>
        </div>
      )}

      <section className="card bg-base-200 shadow">
        <div className="card-body">
          <h2 className="card-title">
            {editingId === null ? <Trans>Server hinzufügen</Trans> : <Trans>Server bearbeiten</Trans>}
          </h2>
          <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1">
              <span className="label label-text">
                <Trans>Name</Trans>
              </span>
              <input
                className="input input-bordered w-full"
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder={t`z. B. Heimserver`}
                aria-label={t`Servername`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label label-text">
                <Trans>Basis-URL</Trans>
              </span>
              <input
                className="input input-bordered w-full"
                value={form.baseUrl}
                onChange={(e) => updateForm({ baseUrl: e.target.value })}
                onPaste={handleBaseUrlPaste}
                placeholder="https://opencode.example.com"
                inputMode="url"
                aria-label={t`Basis-URL`}
              />
            </label>
            <div className="alert alert-info" data-testid="cors-hint">
              <span>
                <Trans>
                  CORS wird benötigt: Ohne CORS-Freigabe des Servers blockiert der Browser
                  alle API-Aufrufe – die Preflight-Anfrage schlägt mit „Failed to fetch“
                  fehl. Auf dem Server starten mit:
                </Trans>
              </span>
              <code className="block text-xs break-all mt-1">
                opencode serve --cors {window.location.origin}
              </code>
            </div>
            <label className="flex flex-col gap-1">
              <span className="label label-text">
                <Trans>Benutzer (Basic Auth)</Trans>
              </span>
              <input
                className="input input-bordered w-full"
                value={form.username}
                onChange={(e) => updateForm({ username: e.target.value })}
                autoComplete="username"
                aria-label={t`Benutzer`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label label-text">
                {editingId === null ? (
                  <Trans>Passwort (Basic Auth)</Trans>
                ) : (
                  <Trans>Neues Passwort (Basic Auth)</Trans>
                )}
              </span>
              <input
                className="input input-bordered w-full"
                type="password"
                value={form.password}
                onChange={(e) => updateForm({ password: e.target.value })}
                autoComplete="current-password"
                aria-label={t`Passwort`}
                placeholder={
                  editingId === null
                    ? t`Passwort festlegen`
                    : t`Leer lassen, um das gespeicherte Passwort zu behalten`
                }
              />
              {editingId !== null && (
                <span className="text-xs opacity-70">
                  <Trans>
                    Leer lassen, um das gespeicherte Passwort zu behalten. Ein neues
                    Passwort überschreibt das gespeicherte. Ein gespeichertes Passwort
                    lässt sich nur entfernen, indem der Server entfernt wird.
                  </Trans>
                </span>
              )}
            </label>
            <div className="flex flex-col gap-1">
              <span className="label label-text" id="server-color-label">
                <Trans>Farbe</Trans>
              </span>
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-labelledby="server-color-label"
                data-testid="server-color-picker"
              >
                {SERVER_COLOR_PALETTE.map((entry) => {
                  const selected = form.color === entry;
                  return (
                    <button
                      key={entry}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={t`Serverfarbe ${entry}`}
                      title={entry}
                      data-testid={`server-color-${entry}`}
                      onClick={() => updateForm({ color: entry })}
                      className={`h-8 w-8 rounded-full border-2 ${
                        selected ? "border-base-content scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: entry }}
                    />
                  );
                })}
              </div>
              <span className="text-xs opacity-70">
                <Trans>
                  Kennzeichnet Tabs, Listen und Badges dieses Servers.
                </Trans>
              </span>
            </div>
            {formError !== null && (
              <div className="alert alert-error">
                <span>{formError}</span>
              </div>
            )}
            {testResult !== null && (
              <div
                className={`alert ${testResult.status === "success" ? "alert-success" : "alert-error"}`}
                data-testid="connection-test-result"
                role="status"
              >
                <span>{testResult.message}</span>
                {testResult.url !== null && (
                  <code
                    className="block text-xs break-all opacity-70"
                    data-testid="connection-test-url"
                  >
                    {testResult.url}
                  </code>
                )}
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {editingId === null ? <Trans>Hinzufügen</Trans> : <Trans>Speichern</Trans>}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={testing}
              >
                {testing ? <Trans>Teste …</Trans> : <Trans>Verbindung testen</Trans>}
              </button>
              {editingId !== null && (
                <button className="btn btn-ghost" type="button" onClick={resetForm}>
                  <Trans>Abbrechen</Trans>
                </button>
              )}
            </div>
          </form>
        </div>
      </section>

      <section className="card bg-base-200 shadow">
        <div className="card-body">
          <h2 className="card-title">
            <Trans>Benachrichtigungen</Trans>
          </h2>
          <p className="text-sm opacity-70">
            <Trans>
              Lokale Hinweise zu Session-, Kompaktierungs- und Freigabe-Ereignissen des
              gewählten Servers. Kein Push-Server, alles bleibt im Browser.
            </Trans>
          </p>
          {!isNotificationSupported() ? (
            <div className="alert alert-warning">
              <span>
                <Trans>Dieser Browser unterstützt keine Benachrichtigungen.</Trans>
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="badge"
                data-testid="notification-status"
                aria-label={t`Status: ${permission}`}
              >
                <Trans>Status:</Trans>{" "}
                {permission === "granted" ? (
                  <Trans>aktiviert</Trans>
                ) : permission === "denied" ? (
                  <Trans>blockiert</Trans>
                ) : (
                  <Trans>nicht angefragt</Trans>
                )}
              </span>
              {permission !== "granted" && (
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={() => void handleEnableNotifications()}
                  disabled={permissionBusy || permission === "denied"}
                >
                  {permissionBusy ? <Trans>Bitte warten …</Trans> : <Trans>Benachrichtigungen aktivieren</Trans>}
                </button>
              )}
              {permission === "denied" && (
                <p className="text-sm opacity-70 w-full">
                  <Trans>
                    Benachrichtigungen sind blockiert. Bitte in den Browser-Einstellungen
                    wieder zulassen.
                  </Trans>
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">
          <Trans>Gespeicherte Server ({serverCount})</Trans>
        </h2>
        {servers.length === 0 ? (
          <p className="opacity-70">
            <Trans>Noch keine Server vorhanden.</Trans>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {servers.map((s) => {
              const notificationsOn = serverEventPrefs[s.id] ?? true;
              const serverName = s.name;
              return (
                <li key={s.id} className="card bg-base-200 shadow">
                  <div className="card-body p-4 flex-row items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        <ServerDot server={s} />
                        {s.name}
                      </div>
                      <div className="text-sm opacity-70">{s.baseUrl}</div>
                      <label className="flex items-center gap-2 mt-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="toggle toggle-sm"
                          checked={notificationsOn}
                          onChange={() => toggleServerEventNotifications(s.id)}
                          aria-label={t`Benachrichtigungen für ${serverName}`}
                          data-testid={`server-notifications-${s.id}`}
                        />
                        <span className="text-sm">
                          <Trans>Benachrichtigungen</Trans>
                        </span>
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-ghost" onClick={() => void handleEdit(s.id)}>
                        <Trans>Bearbeiten</Trans>
                      </button>
                      <button
                        className="btn btn-sm btn-error btn-outline"
                        onClick={() => {
                          if (editingId === s.id) resetForm();
                          removeServer(s.id);
                        }}
                      >
                        <Trans>Entfernen</Trans>
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
