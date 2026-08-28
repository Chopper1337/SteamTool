# Deployment

SteamTool is two pieces: a static frontend and a small Node API. Nothing here
is specific to any one host — fill in your own paths, addresses and secrets.

## Architecture

```
browser
  → reverse proxy / TLS
    → web server
      ├── /            static   ← serves content/
      └── /api/*       proxy    → steamtool-api on HOST:PORT
                                   → third-party vanity resolvers
```

The API serves no static files. Point a web server at `content/` and proxy
`/api/` through to the Node process.

**Serve `content/` only — never the repository root.** Exposing the checkout
publishes `.git`, and with it the full commit history. A `location ~ /\.` deny
rule is worth adding as a second line of defence.

## Frontend

Static files, no build step. Serve `content/` directly.

`content/config.json` is the single source for the site list. Editing it
changes the live list immediately — no API restart, no rebuild. It is fetched
with `cache: "no-cache"`, so an edit appears on the next page load while
unchanged files still get a `304`.

It must be valid JSON. There is deliberately no hard-coded fallback in
`script.js`, so a syntax error makes the list fail visibly rather than silently
serving a stale copy that drifts out of sync. Check before deploying an edit:

```bash
python3 -m json.tool content/config.json > /dev/null && echo OK
```

## API

```bash
cd api
npm ci --omit=dev
cp .env.example .env      # then edit it
npm start
```

### As a systemd service

`steamtool-api.service` in this directory. It runs the API under
`DynamicUser=yes`, keeps state in `/var/lib/steamtool`, restarts on failure,
and logs to the journal.

```bash
cp deploy/steamtool-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now steamtool-api

journalctl -u steamtool-api -f
systemctl status steamtool-api

# after editing known.json or resolvers.json — no restart, no dropped requests
systemctl reload steamtool-api

# confirm the sandbox applied rather than being silently ignored
systemd-analyze security steamtool-api
```

Adjust `WorkingDirectory` and `ExecStart` to match your checkout and your
`node` binary (`readlink -f "$(which node)"`). Units do not inherit your login
`PATH`, so a bare `node` fails under nvm/fnm/asdf.

### Where the checkout can live

`DynamicUser=yes` runs the service as a generated UID, so it can only read a
checkout whose parent directories it can traverse. Whether a checkout under
`/home` qualifies depends on the distribution and on when the account was
created — don't assume, check:

```bash
stat -c '%A %n' ~
```

| Mode | Meaning | What to do |
|---|---|---|
| `drwxr-xr-x` (0755) | world-traversable | nothing — a checkout in `~` works as-is |
| `drwxr-x---` (0750) | owner + group | add `SupplementaryGroups=<group>` to the unit |
| `drwx------` (0700) | owner only | move the checkout, or drop `DynamicUser=` |

These are plain POSIX permissions, applied before `ProtectHome=` is consulted;
no unit setting overrides them.

Defaults differ more than you'd expect. Debian/Ubuntu used `0755` for years and
switched the `adduser` default to `0750` in Ubuntu 21.04 — and on a system
*upgraded* to 21.04 or later, pre-existing home directories keep their original
`0755`, so only accounts created afterwards are private. Arch and several
others default to `0700` via `HOME_MODE` in `/etc/login.defs`.

If the checkout isn't reachable, move it somewhere world-traversable and keep
the isolation:

```bash
mv ~/SteamTool /opt/steamtool          # then re-point any symlink into content/
chown -R "$USER" /opt/steamtool        # so you can still git pull without root
```

…or keep it where it is and give up the dynamic user: replace
`DynamicUser=yes` with `User=`/`Group=` for that account, and relax
`ProtectHome=true` to `read-only` so the service can read its own code. Less
isolation — the service gets that account's access — but no move.

The service only ever *reads* the checkout; all writes go to `StateDirectory`.

Host-specific settings go in an `EnvironmentFile` — by default
`/etc/steamtool/api.env`, created with `0600` permissions — so that no address
or secret has to live in version control:

```
HOST=127.0.0.1
PORT=3000
TRUST_PROXY_HOPS=0
STATS_TOKEN=…
```

### Choosing a bind address

If the web server runs in a container while the API runs on the host, **the
container cannot reach the host's `127.0.0.1`** — inside a container, loopback
is the container. You need one of:

- the container's gateway address (commonly `172.17.0.1`), which containers can
  reach and the wider network cannot;
- `host.docker.internal` via `extra_hosts: host-gateway`;
- the host's own network address — simple, but see the warning below;
- or run the API in the same container network, addressed by service name.

Whatever you choose, `HOST` must match what the proxy actually connects to.
Check with `ss -tlnp` and by reading the `proxy_pass` target.

**If you bind an address reachable beyond the proxy**, the API can be called
directly, skipping the proxy entirely. Two consequences:

- Keep `TRUST_PROXY_HOPS=0`. A caller that reaches the API directly can send
  any `X-Forwarded-For` it likes, so trusting hops would let it choose its own
  `req.ip` — making IP-based rate limiting bypassable by exactly the people
  most likely to try. Raise it to your real hop count only once the port is
  firewalled to the proxy.
- Binding a specific address fails at startup with `EADDRNOTAVAIL` if that
  address isn't configured yet or changes. `After=network-online.target` in the
  unit covers boot ordering; use a static or reserved address, or bind
  `0.0.0.0` behind a firewall rule.

### State

`visitor_count.txt` and `api.log` live in `STEAMTOOL_STATE`, which the unit
sets to `/var/lib/steamtool`. On first start the API copies any existing files
across from `api/` — it copies rather than moves, so the originals remain as a
backup and no history is lost.

Keeping state out of the checkout matters if the checkout is also served by a
web server, or ever gets a `git clean -fdx`.

### The stats token

The site's Stats panel shows visitor counts and the API log. The log contains
the vanity names and SteamID64s of everyone who has used the tool, so it is
**not** public: `/api/stats/logs` returns `503` and stays disabled until
`STATS_TOKEN` is set.

```bash
openssl rand -hex 24
```

Put it in the `EnvironmentFile`. Enter it once in the Stats panel; it is kept
in that browser's `localStorage`. Visitor counts need no token.

## Running it in a container instead

If the rest of your stack is already containerised, adding the API to the same
compose stack is a reasonable alternative to systemd: `restart: unless-stopped`
covers supervision, the service is addressed by name on a shared network
(removing the bind-address question entirely), and the Node version is pinned
in the image. systemd wins on journal integration and verifiable sandboxing.
