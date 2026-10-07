# Deployment

This guide explains how to deploy ResumeFit AI to a production environment. It does not cover custom domains: the application has no hard-coded hostnames, so it runs unchanged on a temporary hosting domain (for example a Hostinger temporary subdomain) and later on a custom domain by changing only environment variables and the proxy/TLS configuration.

Related documents: [architecture.md](architecture.md) (components), [api.md](api.md) (endpoints, including `/api/health`), [security.md](security.md) (security controls and the reasons behind the settings below), [testing.md](testing.md) (running the test suites before a release), [limitations.md](limitations.md).

All commands are run from the repository root unless stated otherwise.

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 22 LTS or newer** | The project is developed on Node 24 and tested in CI on Node 22 (`.github/workflows/ci.yml`). npm is included with Node. |
| **MongoDB 7** | MongoDB Atlas (managed) or a self-hosted MongoDB 7 server. CI uses MongoDB 7.0 through `mongodb-memory-server`. |
| **HTTPS** | Required in production. The refresh cookie is `Secure` by default when `NODE_ENV=production`, and browsers will not store or send it over plain HTTP. |
| Disk / memory | The build needs the full dev dependency tree (TypeScript, Vite). Allow roughly 1 GB of RAM for the build step. |
| Outbound network (optional) | To the AI provider if `ANTHROPIC_API_KEY` is set, and to the Hugging Face hub the first time a research experiment that uses the embedding method runs (the ~23 MB model is downloaded and cached). |

---

## 2. Environment variables

The server reads configuration from environment variables (`server/src/config/env.ts`). `dotenv` also loads a `.env` file **from the current working directory** of the process; variables already present in the environment take precedence over the file. A template with comments is in `server/.env.example`. Never commit a real `.env` file.

| Variable | Default | Required in production | Description |
|---|---|---|---|
| `NODE_ENV` | `development` | **Yes** (`production`) | Enables production behaviour: start-up validation, `Secure` cookies by default, hidden database error detail. |
| `PORT` | `5000` | No | TCP port the Node process listens on. The reverse proxy or hosting panel forwards to this port. |
| `JWT_SECRET` | `dev-secret-key` outside production; none in production | **Yes** | Secret for signing access tokens. Must be at least 32 characters, random. Generate with `openssl rand -base64 48`. The server refuses to start in production if it is missing or too short. |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/resumefit-ai` outside production; none in production | **Yes** | MongoDB connection string, including the database name. The server refuses to start in production without it. |
| `DEMO_MODE` | `false` | Must be `false` / unset | Starts an in-memory MongoDB for local demos (data lost on restart). **Do not use in production: the server refuses to start with `DEMO_MODE=true` when `NODE_ENV=production`.** |
| `CLIENT_URL` | empty | Only for split-origin | Comma-separated browser origins allowed by CORS (with credentials), e.g. `https://app.example.net`. Leave empty for the recommended single-origin deployment. (`CLIENT_ORIGIN` is accepted as a legacy alias.) |
| `SERVER_URL` | empty | No | Public URL of the API. Informational only (documentation and logs). |
| `SERVE_CLIENT` | `false` | **Yes for single-origin** (`true`) | When `true`, Express serves the built React app from `client/dist` and falls back to `index.html` for client-side routes. |
| `TRUST_PROXY` | `0` | **Yes behind a proxy** (`1`) | Number of reverse proxies in front of Node. Needed so `req.ip` (rate limiting, audit log) is the real client IP rather than the proxy's. Set to `1` behind NGINX or a hosting platform proxy. |
| `ACCESS_TOKEN_TTL` | `15m` | No | Lifetime of the JWT access token (a `jsonwebtoken` duration such as `15m`). Keep it short. |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | No | Lifetime of the rotating refresh token and its cookie, in days. |
| `COOKIE_SECURE` | `true` in production, `false` otherwise | No (leave default) | Sets the `Secure` flag on the refresh cookie. `false` is only for local HTTP testing; the server refuses to start in production with `COOKIE_SECURE=false`, so remove that line from a copied `.env`. |
| `COOKIE_SAMESITE` | `strict` | No | `strict`, `lax` or `none`. Keep `strict` for single-origin. `none` is only for split-origin and requires `COOKIE_SECURE=true` (validated at start-up). |
| `ANTHROPIC_API_KEY` | empty | No | Enables the optional AI wording feature in "Fix My Resume". Server-side only. Without it, all scoring and deterministic suggestions work unchanged. |
| `CLAMAV_HOST` | empty | Recommended | Host of a ClamAV `clamd` daemon for upload scanning. Empty disables scanning. |
| `CLAMAV_PORT` | `3310` | No | clamd TCP port. |
| `CLAMAV_REQUIRED` | `false` | Recommended `true` if ClamAV is used | When `true`, uploads are rejected with `503` if the scanner is unreachable. Requires `CLAMAV_HOST` (validated at start-up). |
| `LOG_LEVEL` | `info` | No | `debug`, `info`, `warn` or `error`. Logs are JSON lines on stdout/stderr. |

Minimal production set for the recommended deployment:

```dotenv
NODE_ENV=production
PORT=5000
JWT_SECRET=<at least 32 random characters>
MONGO_URI=mongodb+srv://<user>:<password>@<cluster-host>/resumefit-ai?retryWrites=true&w=majority
SERVE_CLIENT=true
TRUST_PROXY=1
COOKIE_SAMESITE=strict
LOG_LEVEL=info
```

---

## 3. Build

The repository is an npm workspace (`client`, `server`). Build on the target machine or in a build step, then run the compiled output.

```bash
npm ci            # install exact versions from package-lock.json (includes dev dependencies needed to build)
npm run build     # builds client, then server
```

`npm run build` runs:

1. `client`: `tsc -b && vite build`, output in **`client/dist/`** (static `index.html` and `assets/`).
2. `server`: `tsc -p tsconfig.build.json`, output in **`server/dist/`** (entry point `server/dist/server.js`; test files are excluded).

Optional: `npm run samples` regenerates the demo inputs in `samples/` (`sample-resume.pdf`, `sample-resume.docx`, job descriptions). The committed samples are sufficient; this step is not needed for deployment.

Notes:

- `npm ci` installs `mongodb-memory-server` (a server dependency used for demo mode and tests), whose post-install step downloads a MongoDB binary. On a server that will never run demo mode, setting `MONGOMS_DISABLE_POSTINSTALL=1` before `npm ci` skips that download.
- Do not run `npm ci --omit=dev` before building: the build needs TypeScript and Vite. After building you may prune with `npm prune --omit=dev` if disk space matters.
- Before a release, run `npm run verify` (lint, typecheck, unit and API tests, end-to-end tests) on a development machine; see [testing.md](testing.md).

---

## 4. Recommended topology: single origin

```
Browser ──HTTPS──> Reverse proxy / hosting front end (TLS) ──HTTP──> Node (Express, PORT)
                                                                     ├── /api/*  → API
                                                                     └── /*      → client/dist (React app)
                                                                              │
                                                                              └──> MongoDB (Atlas or self-hosted)
```

With `SERVE_CLIENT=true`, one Node process serves both the API and the built client from the same origin. This is the recommended deployment because:

- the browser makes only same-origin requests, so **no CORS configuration** is needed (`CLIENT_URL` stays empty);
- the refresh cookie works with **`SameSite=Strict`**;
- there is only one process to run, monitor and secure.

The client calls the API with the relative base path `/api` (`client/src/api/client.ts`), so it works under any hostname without rebuilding.

### 4.1 How the client files are located

In `server/src/app.ts` the static directory is resolved relative to the compiled file, not the working directory:

```ts
path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')
```

For `server/dist/app.js` this resolves to `<repo>/client/dist`, so the server finds the client build regardless of the directory it is started from, as long as the repository layout (`server/dist` next to `client/dist`) is preserved. If `client/dist/index.html` does not exist, static serving is silently skipped and non-API paths return `404`; build the client before starting.

Static assets are served with `Cache-Control: max-age=3600`. `/api/*` routes are registered first, and unknown `/api` paths return a JSON `404` rather than `index.html`.

### 4.2 Starting the server

From the repository root:

```bash
NODE_ENV=production node server/dist/server.js
```

Equivalently, from `server/`: `NODE_ENV=production npm start` (runs `node dist/server.js`).

Where the `.env` file is read from depends on the working directory: started from the repository root, `dotenv` reads `<repo>/.env`; started from `server/`, it reads `server/.env`. Prefer setting real environment variables (in PM2, systemd or the hosting panel); use a `.env` file only in the directory the process starts in, with permissions restricted to the service user (`chmod 600`).

On start the server:

1. validates the configuration and exits with code 1 (logging `config.invalid` lines) if anything required for production is missing (see [security.md](security.md#212-secrets-and-configuration));
2. connects to MongoDB with a 5-second server-selection timeout;
3. listens on `PORT` and logs `server.started`.

If MongoDB is unreachable at start-up, the process **keeps running in degraded mode**: `/api/health` returns `503` with `database.mode: "unavailable"` and all data routes return `503 DATABASE_UNAVAILABLE`. The initial connection is not retried automatically, so fix the connection and restart the process.

The server handles `SIGTERM` and `SIGINT` by closing the HTTP server and disconnecting from MongoDB, which allows graceful restarts under PM2 or systemd.

### 4.3 Reverse proxy and HTTPS

- TLS must be terminated in front of Node (NGINX with a certificate, or the hosting platform's HTTPS).
- Set `TRUST_PROXY=1` when exactly one proxy sits in front of Node. Do not set it higher than the real number of proxies, otherwise clients can spoof their IP through `X-Forwarded-For` and evade rate limits.
- The helmet configuration sends `Strict-Transport-Security` and a CSP containing `upgrade-insecure-requests`. Serve the site over HTTPS only; on a plain-HTTP public origin, sessions will not persist (the `Secure` cookie is not stored) and sub-resources may fail to load.

---

## 5. Hosting on Hostinger

Hostinger offers several product types, and features differ between plans and change over time. The options below are described generically; check what your plan actually provides in hPanel before choosing one.

### 5.1 Option A: Hostinger VPS (Node + PM2 + NGINX)

This option gives full control and matches the recommended topology exactly.

**1. Install the runtime** (Ubuntu example):

```bash
# Node.js 22 LTS (or newer) from NodeSource or nvm, then:
node -v        # v22.x or newer
sudo npm install -g pm2
sudo apt-get install -y nginx
```

**2. Fetch and build the application** as a non-root user:

```bash
git clone <your-repository-url> resumefit
cd resumefit
npm ci
npm run build
```

**3. Create a PM2 ecosystem file** `ecosystem.config.cjs` in the repository root (this file is not part of the repository; keep it out of version control because it contains secrets, or reference an environment file instead):

```js
module.exports = {
  apps: [
    {
      name: 'resumefit',
      cwd: __dirname,
      script: 'server/dist/server.js',
      instances: 1,            // rate limits are in-memory per process; keep a single instance
      exec_mode: 'fork',
      max_memory_restart: '700M',
      kill_timeout: 10000,     // allow graceful shutdown (SIGINT handling)
      env: {
        NODE_ENV: 'production',
        PORT: '5000',
        SERVE_CLIENT: 'true',
        TRUST_PROXY: '1',
        COOKIE_SAMESITE: 'strict',
        LOG_LEVEL: 'info',
        JWT_SECRET: '<at least 32 random characters>',
        MONGO_URI: '<your MongoDB connection string>',
        // ANTHROPIC_API_KEY: '',
        // CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: '3310', CLAMAV_REQUIRED: 'true',
      },
    },
  ],
};
```

**4. Start and persist across reboots:**

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup          # prints a command to run with sudo; run it once
pm2 status
pm2 logs resumefit
```

**5. Configure NGINX** as a reverse proxy, for example `/etc/nginx/sites-available/resumefit`:

```nginx
server {
    listen 80;
    server_name <your-temporary-or-custom-hostname>;

    # Uploads are limited to 5 MB by the application; allow multipart overhead.
    client_max_body_size 6m;

    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;   # analysis and AI rewriting can take tens of seconds
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/resumefit /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Then obtain a TLS certificate for the hostname (for example with Certbot: `sudo certbot --nginx -d <hostname>`), which adds the `listen 443 ssl` block and an HTTP-to-HTTPS redirect. Without `client_max_body_size`, NGINX's default 1 MB limit would reject most resume uploads with `413` before they reach Node.

Restrict the firewall to ports 22, 80 and 443; port 5000 should not be publicly reachable.

**Updating:**

```bash
git pull
npm ci
npm run build
pm2 reload resumefit
```

### 5.2 Option B: Hostinger managed Node.js application hosting

If your plan provides Node.js application hosting in hPanel (a "Node.js" section where you can create an application), the recommended topology can usually be reproduced as follows. Menu names and available fields may differ.

1. Upload or connect the repository so that the full layout (`client/`, `server/`, root `package.json`, `package-lock.json`) is present.
2. Select a Node.js version of 22 or newer, if the panel offers a choice.
3. Set the build/install command to `npm ci && npm run build` (or run these through the panel's terminal or SSH, if available).
4. Set the **application root** to the repository root and the **entry file / start file** to `server/dist/server.js`. If the panel only accepts a start command, use `node server/dist/server.js`.
5. Enter the environment variables from [section 2](#2-environment-variables) in the panel: at minimum `NODE_ENV=production`, `JWT_SECRET`, `MONGO_URI`, `SERVE_CLIENT=true`, `TRUST_PROXY=1`.
6. If the platform assigns the port, make sure it is passed to the app as `PORT` (the server reads `PORT` and defaults to 5000).
7. Enable HTTPS for the assigned (temporary) domain in the panel, if not enabled automatically.

Things to confirm with your plan before relying on this option: whether outbound connections to MongoDB Atlas are allowed, whether long requests (up to about a minute for AI rewriting) are permitted by the platform proxy, the request body size limit for uploads (at least 6 MB), and whether `npm ci` is allowed to download the `mongodb-memory-server` binary (set `MONGOMS_DISABLE_POSTINSTALL=1` if not).

### 5.3 Option C: split origin (static client and API on different origins)

Use this only if the client must be hosted separately from the API (for example static hosting for `client/dist` and a Node host for the API).

Server settings:

```dotenv
CLIENT_URL=https://<client-origin>       # exact origin(s), comma-separated, no trailing slash
COOKIE_SAMESITE=none
COOKIE_SECURE=true                        # required with SameSite=None (validated at start-up)
SERVE_CLIENT=false
```

Important caveats:

- **The client calls a relative `/api` path** (`API_BASE = '/api'` in `client/src/api/client.ts`) and has no build-time setting for an API base URL. The static host must therefore proxy `/api/*` to the API server (in which case the browser sees a single origin and the settings above are unnecessary), or the client code must be changed to use an absolute API URL.
- With a truly cross-site API, the refresh cookie becomes a **third-party cookie**. Browsers increasingly block third-party cookies (Safari by default, Chrome depending on user settings), in which case sessions cannot be restored after a page reload and users are signed out when the access token expires.
- `SameSite=None` weakens one of the CSRF defence layers; the custom-header check and CORS allowlist still apply (see [security.md](security.md#24-csrf-defence)).

For these reasons the single-origin deployment is strongly preferred.

---

## 6. MongoDB Atlas setup

1. Create a project and a cluster (a shared/free tier is sufficient for evaluation; choose a region close to the server).
2. **Database access**: create a database user with a strong generated password and the least privilege needed (`readWrite` on the application database, e.g. `resumefit-ai`). Do not use an Atlas admin account.
3. **Network access**: add the public IP address of the VPS or hosting server to the IP access list. Avoid `0.0.0.0/0`; if the hosting platform has no fixed outbound IP, document the risk and rely on the strong database password and TLS.
4. **Connection string**: in "Connect" > "Drivers", copy the `mongodb+srv://` string, insert the user and password (URL-encode special characters in the password) and add the database name before the query string:

   ```
   mongodb+srv://resumefit_app:<password>@<cluster-host>/resumefit-ai?retryWrites=true&w=majority
   ```

   Put this value in `MONGO_URI`. Atlas connections use TLS by default.
5. Collections and indexes (including the TTL indexes for refresh tokens and audit logs) are created automatically by Mongoose on first use.

For a self-hosted MongoDB 7: enable authentication, bind it to localhost or a private network, create an application user with `readWrite` on the database, enable TLS if it is reached over a network, and enable encryption at rest where available.

---

## 7. Post-deployment verification

Replace `<base>` with the deployed HTTPS URL.

1. **Health check**

   ```bash
   curl -s <base>/api/health
   ```

   Expect HTTP `200` and `"status": "ok"`, `"database": {"connected": true, "mode": "mongodb", ...}`. Also check `scoringVersion`, `aiRewrite` (`true` only if `ANTHROPIC_API_KEY` is set) and `uploadScanning` (`"clamav"` or `"none"`). `mode` must not be `"demo-in-memory"`.
2. **Client loads**: open `<base>/` in a browser; a deep link such as `<base>/dashboard` should also load the app (SPA fallback).
3. **Register and log in** with a test account. Reload the page: you should remain signed in (the refresh cookie works). In the browser developer tools, confirm the `rf_refresh` cookie has `HttpOnly`, `Secure`, `SameSite=Strict` and `Path=/api/auth`, and that `localStorage` holds no token (only `resumefit-profile`).
4. **Upload a sample**: create an analysis using `samples/sample-resume.pdf` (or `.docx`) with the text of `samples/sample-job-description.txt`. A report with scores should be produced. Uploading a file larger than 5 MB should give a clear "File is too large" message, not a proxy error page.
5. **Response headers**:

   ```bash
   curl -sI <base>/api/health
   ```

   Expect `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`, `X-Request-Id` and `RateLimit` headers, and **no** `X-Powered-By`.
6. **Proxy and IPs**: in the logs, `request.completed` lines should show real client IPs, not `127.0.0.1` (confirms `TRUST_PROXY`).
7. **Logout**: sign out, reload, and confirm you are on the sign-in page.
8. **Database outage behaviour** (optional, on a staging copy): point `MONGO_URI` to an unreachable host and restart. The process should stay up, `/api/health` should return `503` with `"status": "degraded"` and `"mode": "unavailable"`, and data routes should return `503 DATABASE_UNAVAILABLE` without connection details (production hides `detail`). Restore the correct URI and restart.

---

## 8. Operations

### 8.1 Logs

The server writes one JSON object per line: `info`/`debug` to stdout and `warn`/`error` to stderr. Each line has `time`, `level`, `event` and, within requests, `requestId` and `userId`. Secrets are redacted by key name. Useful events: `server.started`, `config.invalid`, `database.connected`, `database.unavailable`, `request.completed`, `request.failed`, `rate_limit.exceeded`, `upload.infected`, `upload.scan_skipped`, `audit`.

- With PM2: `pm2 logs resumefit`, files under `~/.pm2/logs/`. Install log rotation with `pm2 install pm2-logrotate` so logs do not fill the disk.
- Filter with `jq`, e.g. `pm2 logs resumefit --raw | jq 'select(.level=="error")'`.
- The `X-Request-Id` response header lets you find the log lines for a specific user-reported problem.

Security-relevant events are also stored in the `auditlogs` collection for 180 days (see [security.md](security.md#214-audit-logging)).

### 8.2 Health checks

`GET /api/health` is unauthenticated and returns `200` when the database is connected and `503` otherwise, so it can be used directly by an uptime monitor or load balancer. It also reports `uptimeSeconds` and the database ping time (`pingMs`). If health stays at `503` after a database incident at start-up, restart the process (the initial connection is not retried; once connected, the MongoDB driver reconnects automatically after transient drops).

### 8.3 Backups

- **Atlas**: enable cloud backups / snapshots on the cluster (availability depends on the cluster tier) and test a restore.
- **Self-hosted or additional copies**: `mongodump --uri="$MONGO_URI" --archive=resumefit-$(date +%F).gz --gzip`, restore with `mongorestore --uri=... --archive=... --gzip`. Store backups encrypted and off the server; they contain personal data.
- The `refreshtokens` and `auditlogs` collections are self-expiring; backing them up is optional.

### 8.4 Rotating `JWT_SECRET`

Change the value and restart. All existing access tokens become invalid immediately. Refresh tokens are opaque and stored in the database, so they are not affected by the JWT secret: clients obtain a new access token through `/api/auth/refresh` on their next request. To force every user to sign in again, additionally revoke all refresh tokens (for example by deleting the documents in the `refreshtokens` collection).

### 8.5 Scoring version upgrades

`SCORING_VERSION` is defined in code (`server/src/lib/scoringEngine.ts`, from `MATCHING_VERSION` in `server/src/lib/matchingEngine.ts`), not in the environment, and is reported by `/api/health`. Every analysis and resume version stores the `scoringVersion` it was produced with. After deploying a new scoring version:

- existing analyses keep their stored scores and version label; they are not recomputed automatically;
- users can re-score an analysis (`POST /api/analysis/:id/rescore`) to obtain scores from the current engine;
- comparisons between analyses scored with different versions should be interpreted with care. Record the change in the release notes.

### 8.6 Optional: ClamAV upload scanning

On a VPS (Ubuntu example):

```bash
sudo apt-get install -y clamav-daemon
sudo systemctl enable --now clamav-freshclam clamav-daemon
```

Configure clamd to listen on TCP on localhost (in `/etc/clamav/clamd.conf`: `TCPSocket 3310` and `TCPAddr 127.0.0.1`), restart it, then set `CLAMAV_HOST=127.0.0.1`, `CLAMAV_PORT=3310` and `CLAMAV_REQUIRED=true`. Restart the app and check that `/api/health` reports `"uploadScanning": "clamav"`. clamd needs roughly 1 GB of RAM for its signature database. Managed Node.js hosting usually cannot run clamd; in that case scanning stays disabled (documented as a residual risk in [security.md](security.md#3-known-limitations--residual-risks)).

### 8.7 Optional: AI wording

Set `ANTHROPIC_API_KEY` and restart; `/api/health` then reports `"aiRewrite": true`. The feature is limited to 10 requests per user per hour and never affects scores. Monitor API usage and cost in the provider console. Remove the variable to disable the feature.

### 8.8 Scaling

Run a **single instance**. Rate-limit counters are kept in process memory, so multiple instances or PM2 cluster mode would multiply the effective limits (see [security.md](security.md#3-known-limitations--residual-risks)). Scaling out would require a shared rate-limit store.

---

## 9. Pre-deployment checklist

- [ ] `npm run verify` passes on a development machine (lint, typecheck, unit/API tests, end-to-end tests).
- [ ] Target server runs Node.js 22 or newer.
- [ ] MongoDB 7 / Atlas cluster created; application database user with least privilege; network access allowlist set; backups enabled.
- [ ] `NODE_ENV=production`.
- [ ] `JWT_SECRET` set to at least 32 random characters, unique to this deployment, not committed anywhere.
- [ ] `MONGO_URI` set and reachable from the server.
- [ ] `DEMO_MODE` unset or `false`, and the start command does not include `--demo`.
- [ ] `SERVE_CLIENT=true` and `CLIENT_URL` empty (single-origin), or the split-origin settings and caveats in [5.3](#53-option-c-split-origin-static-client-and-api-on-different-origins) are addressed.
- [ ] `TRUST_PROXY` equals the number of proxies in front of Node (normally `1`).
- [ ] HTTPS enabled for the hostname; `COOKIE_SECURE` left at its production default (`true`); `COOKIE_SAMESITE=strict`.
- [ ] Reverse proxy allows request bodies of at least 6 MB and read timeouts of at least 60 seconds.
- [ ] Node port is not publicly exposed; firewall allows only SSH, HTTP and HTTPS.
- [ ] `npm ci` and `npm run build` completed; `client/dist/index.html` and `server/dist/server.js` exist.
- [ ] Process manager configured (PM2 with `pm2 save` and `pm2 startup`, or the hosting panel) with a single instance; log rotation enabled.
- [ ] Optional features decided: ClamAV (`CLAMAV_HOST`, `CLAMAV_REQUIRED=true`) and AI wording (`ANTHROPIC_API_KEY`).
- [ ] `.env` files (if used) are readable only by the service user and not in version control.
- [ ] Post-deployment verification in [section 7](#7-post-deployment-verification) completed, including `/api/health` reporting `"mode": "mongodb"`.
