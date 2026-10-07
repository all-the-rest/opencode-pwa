# 06 - Remote Access (PWA → VPS API, CORS + Cookie Gate)

Status: problem analysed 2026-10-07, fix is owner-side (VPS/Caddy). No PWA code change yet.

## 1. Problem statement

The PWA at `https://ocweb.all-the.rest` must call the Opencode API at
`https://remote-code.all-the.rest` cross-origin. That currently fails in the
browser with "Failed to fetch".

Measurement evidence (2026-10-07, unauthenticated):

- `GET https://remote-code.all-the.rest/api/info` → `302` to `/login.html`
  (Caddy cookie gate, `code-auth` sidecar via `forward_auth`, `uri /check` —
  see `remote/Caddyfile.fragment` lines 36–49 in `opencode-web-gate`).
- Zero CORS headers on the response: no `Access-Control-Allow-Origin`,
  preflight (`OPTIONS`) unanswered.
- Consequence: the browser blocks even reading the 302, and no credentialed
  cross-origin request (`fetch` with `Authorization` or `credentials:
  "include"`) can succeed.

Root cause chain (all verified in `opencode-web-gate`, read-only):

1. `remote/Caddyfile.fragment` contains **no** `Access-Control-*` header
   anywhere (only `security_headers`/`compress` imports and the
   `Authorization "__OPENCODE_BASIC__"` upstream injection, lines 50–52).
2. Every path except `/login.html`, `/api/login`, `/api/me`, `/api/logout`,
   `/sw.js` falls into the catch-all `handle` with `forward_auth` against
   `code-auth-remote:8081`, which 302-redirects unauthenticated browsers to
   `/login.html`. That includes all real API paths (`/api/info`,
   `/api/session`, `/api/event` SSE, …).
3. The gate cookie is `auth=user:exp:sig`, set with
   `HttpOnly; Secure; SameSite=Lax; Path=/` (verified in the sidecar source
   embedded in `remote/docker-compose.yml` lines 280, 455–456, 500–502 —
   login, logout and cookie-signing paths all use `SameSite=Lax`).
   `Lax` means the cookie is **not** sent on cross-site `fetch`/preflight
   from `ocweb.all-the.rest`, so the cookie gate can never pass cross-origin
   as configured.
4. The PWA authenticates per request with
   `Authorization: Basic base64(user:pass)` (see `features/02-api-contract.md`),
   where the password is the Opencode server password resolved from the
   credential vault. Caddy currently **overwrites** any client-sent
   `Authorization` with `header_up Authorization "__OPENCODE_BASIC__"`. A
   cross-origin client-Basic strategy therefore also needs a Caddy change
   (pass-through or re-check), not just headers.

## 2. Proposed Caddy change (paste template)

Constraints for the snippet below:

- CORS headers apply to `/api/*` only (not the static site, not `/login.html`).
- Allowed origin is exactly `https://ocweb.all-the.rest` (no `*`, because
  both candidate strategies use credentials).
- `OPTIONS` preflight is answered `204` at the edge, before `forward_auth`.
- `Vary: Origin` is set so caches don't poison the header.
- SSE (`GET /api/event`) stays a plain `GET` — no preflight involved as long
  as the PWA uses only safelisted headers + `Authorization` (which *does*
  trigger a preflight; hence the `Access-Control-Allow-Headers` entry).

```caddy
__REMOTE_DOMAIN__ {
	import security_headers
	import compress

	# --- CORS edge for the PWA (https://ocweb.all-the.rest) ---
	# Must sit OUTSIDE / BEFORE the forward_auth catch-all so that
	# preflights never hit the cookie gate.
	@api_preflight {
		method OPTIONS
		path /api/*
	}
	handle @api_preflight {
		header {
			Access-Control-Allow-Origin "https://ocweb.all-the.rest"
			Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS"
			Access-Control-Allow-Headers "Authorization, Content-Type"
			Access-Control-Allow-Credentials "true"
			Access-Control-Max-Age "600"
			Vary Origin
		}
		respond "" 204
	}
	@api {
		path /api/*
	}
	handle @api {
		# Actual responses also carry the CORS headers (defer-style so that
		# proxied / auth-rejected responses are covered too).
		header {
			Access-Control-Allow-Origin "https://ocweb.all-the.rest"
			Access-Control-Allow-Credentials "true"
			Vary Origin
			defer
		}
	}

	# ... existing handles (/login.html, /api/login, /api/me, /api/logout,
	# /sw.js, catch-all forward_auth + reverse_proxy) follow unchanged,
	# except for the option-A / option-B decision below.
}
```

Notes:

- `Access-Control-Allow-Origin` must echo the single PWA origin literally;
  `*` is incompatible with `Allow-Credentials: true` and browsers will
  reject the response.
- `Allow-Headers` must list `Authorization`, otherwise every PWA call (Basic
  auth) fails its preflight even after the gate is opened.
- `defer` on the real-response header block matters: without it, Caddy sets
  the header before the proxy/auth handling and error/redirect responses can
  lose it.

### SameSite assessment (verified, not assumed)

The current Caddyfile sets **nothing** about cookies; the `Set-Cookie`
strings come from the sidecar (`remote/docker-compose.yml` embedded
`auth.py`). All three paths (login success, logout, `make_cookie`) emit
`SameSite=Lax`. So a cross-site cookie strategy (option A) **requires** a
sidecar change to `SameSite=None; Secure` — a Caddy-only edit is not enough
for option A.

## 3. Strategy options

### Option A — cross-site cookie (`credentials: "include"`)

- Sidecar change: `SameSite=Lax` → `SameSite=None; Secure` (login + logout
  paths in `remote/docker-compose.yml` embedded `auth.py`).
- Caddy change: CORS snippet above + keep `forward_auth` for `/api/*`.
- PWA change: login via `POST https://remote-code.all-the.rest/api/login`
  with `credentials: "include"`, then all API `fetch` with
  `credentials: "include"` (no `Authorization` header needed afterwards;
  session TTL default 43200 s).
- Cons: weakens the login cookie to third-party-sendable (CSRF surface on
  every `remote-code` path grows; needs CSRF review of the sidecar, which
  currently has none — `POST /api/login` takes JSON/form with no token);
  cookie expiry/session handling in the PWA; `SameSite=None` requires
  `Secure` (already set) and drops support on a few old clients; debugging
  third-party-cookie blocking (Safari/Firefox partitions) is painful.

### Option B — `/api/*` bypasses the cookie gate, client Basic auth (RECOMMENDED)

- Caddy change: CORS snippet above + a dedicated `handle /api/*` placed
  **before** the cookie-gated catch-all that does **not** run
  `forward_auth`, but checks the client-sent `Authorization: Basic …`
  (Caddy `basicauth` against the Opencode server password hash — note this
  is `OPENCODE_PASSWORD`, *not* `AUTH_HASH`, see gate `AGENTS.md` §4) and
  then `reverse_proxy code-dev:8080` passing the client header through
  (replace `header_up Authorization "__OPENCODE_BASIC__"` with a
  pass-through on this handle, or keep injecting upstream while gating on
  the client header).
- PWA change: none architectural — the PWA already sends
  `Authorization: Basic …` per request from the vault
  (`features/02-api-contract.md`); only the base URL becomes cross-origin
  plus CORS-compliant `fetch` (default mode is fine once the server answers
  preflights; do **not** use `no-cors`).
- Pros: no cookie semantics change (`SameSite=Lax` stays, CSRF surface
  unchanged); stateless per-request auth matches the existing PWA client;
  no third-party-cookie dependence (Safari/Firefox-safe); the login page /
  human browser flow keeps working exactly as before.
- Cons: needs the Basic hash available to Caddy (one more secret in the
  Caddy provisioning, same class as the existing `__OPENCODE_BASIC__`
  placeholder); brute-force exposure of `/api/*` directly — mitigate with
  Caddy `rate_limit` on the handle if available.

### Recommendation

**Option B.** Reasons: it matches what the PWA already does (per-request
Basic from the vault, no session state to manage), it leaves the cookie gate
and its `Lax` semantics untouched (smallest security delta — no new CSRF
surface), and it is immune to third-party-cookie blocking, which option A
lives or dies by. The only new secret handling (Basic hash for Caddy) reuses
the existing `__OPENCODE_BASIC__` placeholder workflow.

## 4. Portainer apply steps (owner-side, manual — never auto-deployed)

Per gate `AGENTS.md` §1: the pasted file is the live source; editing the repo
alone deploys nothing. The Caddyfile itself goes through the caddyfile-repo
(`Caddyfile` + `./sync.sh` validate + reload, see
`remote/Caddyfile.fragment` header).

1. Fill the snippet's origin/placeholders, merge it into the `Caddyfile`
   for `__REMOTE_DOMAIN__` (= `remote-code.all-the.rest`) in the
   caddyfile-repo (option B additionally: `basicauth` line + `handle /api/*`
   ordering before the catch-all).
2. `./sync.sh` (validate + reload Caddy) — or the Portainer equivalent for
   the Caddy stack if `sync.sh` is unavailable; then confirm the reload
   succeeded (no validation error in the Caddy log).
3. If option A were chosen instead: additionally update the sidecar
   `Set-Cookie` strings to `SameSite=None; Secure` and redeploy the
   `code-remote` Portainer stack (repo edit alone does nothing).
4. Verify with the curl proofs in `AGENTS.todo.md` (preflight 204,
   `Access-Control-Allow-Origin`, authenticated `GET /api/info` → 200).
5. Only then point the PWA at the remote base URL and retest in the browser.

## 5. Live verification 2026-10-07 (deployed via caddyfile-repo, Option B)

Measured against `https://remote-code.all-the.rest` (Caddy Basic-gate for
`/api/*`, `@api` matcher requires `header Authorization *` so cookie
requests keep working; `OPTIONS` answered 204 before auth):

| Fall | Ergebnis |
|---|---|
| `GET /api/info` + Origin, ohne Basic | 302 → `/login.html` (korrekt) |
| `GET /api/info` + Origin + korrektes Basic | 200 + `Access-Control-Allow-Origin` |
| Basic falsch | 401 + ACAO, `realm="restricted"` (Caddy, nicht opencode) |
| `OPTIONS` | 204 + Allow-Methods/Headers/Credentials/Max-Age |

PWA credential rule: username MUST be `opencode` (Caddy `basic_auth` maps
on the name — any other stored username 401s every request), password is
the **server password** (`OPENCODE_PASSWORD`), NOT the login password
(`AUTH_HASH`). Debug hint: `realm="restricted"` = Caddy rejected,
`realm="Secure Area"` + `{"_tag":"UnauthorizedError"}` = opencode itself
rejected (wrong password injected upstream).
