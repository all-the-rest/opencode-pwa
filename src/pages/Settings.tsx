import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { readCredential } from "../lib/credentialVault.ts";
import {
  ensurePermission,
  getPermissionStatus,
  isNotificationSupported,
  type NotificationPermissionState,
} from "../lib/notify.ts";
import { useServers } from "../state/servers.tsx";

interface FormState {
  name: string;
  baseUrl: string;
  username: string;
  password: string;
}

const emptyForm: FormState = { name: "", baseUrl: "", username: "", password: "" };

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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const name = form.name.trim();
    const baseUrl = form.baseUrl.trim().replace(/\/$/, "");
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

  /** The password is sealed in the vault, so editing reads it back first. */
  async function handleEdit(id: string) {
    const server = servers.find((s) => s.id === id);
    if (!server) return;
    setForm({
      name: server.name,
      baseUrl: server.baseUrl,
      username: server.username,
      password: await readCredential(id),
    });
    setEditingId(id);
    setFormError(null);
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
                onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="https://opencode.example.com"
                inputMode="url"
                aria-label={t`Basis-URL`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label label-text">
                <Trans>Benutzer (Basic Auth)</Trans>
              </span>
              <input
                className="input input-bordered w-full"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoComplete="username"
                aria-label={t`Benutzer`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label label-text">
                <Trans>Passwort (Basic Auth)</Trans>
              </span>
              <input
                className="input input-bordered w-full"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="current-password"
                aria-label={t`Passwort`}
              />
            </label>
            {formError !== null && (
              <div className="alert alert-error">
                <span>{formError}</span>
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {editingId === null ? <Trans>Hinzufügen</Trans> : <Trans>Speichern</Trans>}
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
                      <div className="font-semibold">{s.name}</div>
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
