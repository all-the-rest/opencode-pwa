import { useState } from "react";
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
  const { servers, addServer, updateServer, removeServer } = useServers();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    getPermissionStatus(),
  );
  const [permissionBusy, setPermissionBusy] = useState(false);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const baseUrl = form.baseUrl.trim().replace(/\/$/, "");
    if (name === "" || baseUrl === "") {
      setFormError("Name und Basis-URL sind Pflichtfelder.");
      return;
    }
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        setFormError("Basis-URL muss mit http:// oder https:// beginnen.");
        return;
      }
    } catch {
      setFormError("Basis-URL ist ungültig.");
      return;
    }
    const payload = {
      name,
      baseUrl,
      username: form.username.trim(),
      password: form.password,
    };
    if (editingId === null) {
      addServer(payload);
    } else {
      updateServer(editingId, payload);
    }
    resetForm();
  }

  function handleEdit(id: string) {
    const server = servers.find((s) => s.id === id);
    if (!server) return;
    setForm({
      name: server.name,
      baseUrl: server.baseUrl,
      username: server.username,
      password: server.password,
    });
    setEditingId(id);
    setFormError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Einstellungen</h1>
      <p className="text-sm opacity-70">
        Server werden lokal im Browser (localStorage) gespeichert. Pro Server ein Benutzer
        (Basic Auth).
      </p>

      <section className="card bg-base-200 shadow">
        <div className="card-body">
          <h2 className="card-title">{editingId === null ? "Server hinzufügen" : "Server bearbeiten"}</h2>
          <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
            <label className="form-control">
              <span className="label label-text">Name</span>
              <input
                className="input input-bordered"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="z. B. Heimserver"
                aria-label="Servername"
              />
            </label>
            <label className="form-control">
              <span className="label label-text">Basis-URL</span>
              <input
                className="input input-bordered"
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="https://opencode.example.com"
                inputMode="url"
                aria-label="Basis-URL"
              />
            </label>
            <label className="form-control">
              <span className="label label-text">Benutzer (Basic Auth)</span>
              <input
                className="input input-bordered"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoComplete="username"
                aria-label="Benutzer"
              />
            </label>
            <label className="form-control">
              <span className="label label-text">Passwort (Basic Auth)</span>
              <input
                className="input input-bordered"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="current-password"
                aria-label="Passwort"
              />
            </label>
            {formError !== null && (
              <div className="alert alert-error">
                <span>{formError}</span>
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <button className="btn btn-primary" type="submit">
                {editingId === null ? "Hinzufügen" : "Speichern"}
              </button>
              {editingId !== null && (
                <button className="btn btn-ghost" type="button" onClick={resetForm}>
                  Abbrechen
                </button>
              )}
            </div>
          </form>
        </div>
      </section>

      <section className="card bg-base-200 shadow">
        <div className="card-body">
          <h2 className="card-title">Benachrichtigungen</h2>
          <p className="text-sm opacity-70">
            Lokale Hinweise zu Session-, Kompaktierungs- und Freigabe-Ereignissen des
            gewählten Servers. Kein Push-Server, alles bleibt im Browser.
          </p>
          {!isNotificationSupported() ? (
            <div className="alert alert-warning">
              <span>Dieser Browser unterstützt keine Benachrichtigungen.</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="badge"
                data-testid="notification-status"
                aria-label={`Status: ${permission}`}
              >
                Status:{" "}
                {permission === "granted"
                  ? "aktiviert"
                  : permission === "denied"
                    ? "blockiert"
                    : "nicht angefragt"}
              </span>
              {permission !== "granted" && (
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={() => void handleEnableNotifications()}
                  disabled={permissionBusy || permission === "denied"}
                >
                  {permissionBusy ? "Bitte warten …" : "Benachrichtigungen aktivieren"}
                </button>
              )}
              {permission === "denied" && (
                <p className="text-sm opacity-70 w-full">
                  Benachrichtigungen sind blockiert. Bitte in den Browser-Einstellungen
                  wieder zulassen.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Gespeicherte Server ({servers.length})</h2>
        {servers.length === 0 ? (
          <p className="opacity-70">Noch keine Server vorhanden.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {servers.map((s) => (
              <li key={s.id} className="card bg-base-200 shadow">
                <div className="card-body p-4 flex-row items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-sm opacity-70">{s.baseUrl}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-sm btn-ghost" onClick={() => handleEdit(s.id)}>
                      Bearbeiten
                    </button>
                    <button
                      className="btn btn-sm btn-error btn-outline"
                      onClick={() => {
                        if (editingId === s.id) resetForm();
                        removeServer(s.id);
                      }}
                    >
                      Entfernen
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
