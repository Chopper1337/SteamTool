# API Documentation

## Overview
This API resolves Steam IDs, looks up known accounts, and records the visitor
and log data shown in the site's Stats panel. Express 5 on Node, JSON in and
out. It serves no static files — a web server does that (see `deploy/README.md`).

## Endpoints

### 1. `/api/resolve-vanity` (GET)
**Purpose**: Resolve a Steam vanity URL to its ID64 by querying multiple resolvers.

**Request Parameters**:
- `id` (query): 3–32 characters, `A-Z a-z 0-9 _ -`. Required.

**Response Examples**:
- Success:
  ```json
  { "steamid64": "76561198043955928", "source": "steamid.co" }
  ```
- Error: Invalid ID format
  ```json
  { "error": "invalid id: only A-Z, a-z, 0-9, _, - allowed" }
  ```
- Error: No resolver succeeded
  ```json
  { "error": "no resolver succeeded" }
  ```

**Notes**:
- Resolvers are tried in sequence from a random starting point, under a single
  6-second budget for the whole request. They are deliberately *not* raced in
  parallel: racing would answer marginally faster but would send five outbound
  requests per lookup instead of usually one.
- Which resolver failed and why goes to the log, not to the response body.

**Resolver Configuration** — `resolvers.json`:
- `name`: identifier used in logs.
- `urlTemplate`: template with an `{id}` placeholder.
- `responsePath`: dot-separated path to the ID (e.g. `response.ids.steam64Id`).

```json
[
  {
    "name": "steamidresolver.cn",
    "urlTemplate": "https://steamidresolver.cn/profiles/{id}/",
    "responsePath": "response.ids.steam64Id"
  }
]
```

---

### 2. `/api/known` (GET)

**Purpose**: Fetch information about a known account.

**Request Parameters**:
- `id` (query): a SteamID64 (17 digits). Required.

**Response Examples**:
- Success:
  ```json
  {
    "ids": [ "76561198043955928" ],
    "name": "neokCS",
    "info": [ "YouTuber", "Twitch streamer" ],
    "links": [ "twitch.tv/neok", "youtube.com/neokcs" ]
  }
  ```
- Not found: `{ "error": "Not found" }`

Entries are indexed by ID at startup. A record missing an `ids` array is
skipped rather than being allowed to fail the lookup.

---

### 3. `/api/visitor-count` (GET)

**Purpose**: Today's visitor count. Returns `count: 0` when nobody has visited
yet today — it reports the current day, never the last day that happened to
have traffic.

```json
{ "date": "2026-08-28", "count": 6 }
```

---

### 4. `/api/visitor-count` (POST)

**Purpose**: Increment today's count and return the updated value. Same
response shape as the GET.

---

### 5. `/api/stats/visitors` (GET)

**Purpose**: The full daily history, powering the Stats panel chart.

```json
{
  "days": [
    { "date": "2026-08-27", "count": 38 },
    { "date": "2026-08-28", "count": 6 }
  ],
  "total": 205,
  "today": 6
}
```

---

### 6. `/api/stats/logs` (GET)

**Purpose**: The tail of the API log, as shown in the site's Stats panel.

**Request Parameters**:
- `limit` (query): lines to return, 1 to `MAX_LOG_LINES`. Defaults to 200.

**Authentication**: required. Supply `STATS_TOKEN` as either an
`X-Stats-Token` header or a `token` query parameter.

```json
{
  "lines": [
    "2026-08-27 20:35:20.323Z Resolve vanity request for Mariktatarik to 76561199020280862"
  ],
  "total": 1,
  "capacity": 5000
}
```

- `401 unauthorized` — wrong or missing token.
- `503 stats_token_not_configured` — `STATS_TOKEN` is unset, so the endpoint is
  disabled. **This is the default.** The log contains the vanity names and
  SteamID64s of everyone who has used the tool, so it is not public data.

---

### 7. `/api/health` (GET)

**Purpose**: Cheap liveness check for the proxy or a monitor.

```json
{ "ok": true, "uptime": 8, "resolvers": 5, "known": 7, "logLines": 1 }
```

---

## Configuration

Environment variables — see `.env.example` for the annotated version.

| Variable | Purpose |
|---|---|
| `HOST`, `PORT` | Bind address. |
| `TRUST_PROXY_HOPS` | Reverse proxies in front of the API. Without it `req.ip` is the proxy for every visitor. Keep at 0 unless the port is reachable only by the proxy; never exceed the real hop count. |
| `STATS_TOKEN` | Enables `/api/stats/logs`. Unset = endpoint disabled. |
| `STEAMTOOL_STATE` | Where `visitor_count.txt` and `api.log` live. Defaults to `api/`. |
| `MAX_LOG_LINES` | Log lines retained and served. Default 5000. |
| `STEAMTOOL_ORIGIN` | CORS origin. Defaults to `*`. |

**State migration**: on first start with `STEAMTOOL_STATE` pointing somewhere
new, the API copies any existing `visitor_count.txt` and `api.log` across from
the app directory. It copies rather than moves, so the originals remain as a
backup and nothing is lost.

**Reload without restart**: `SIGHUP` re-reads `known.json` and `resolvers.json`
in place — `systemctl reload steamtool-api`. Editing a player entry needs no
restart and drops no connections.

**Graceful shutdown**: `SIGTERM`/`SIGINT` stop accepting connections and let
in-flight requests finish before exiting.

**Data file resilience**: an unparseable `known.json` or `resolvers.json` is
logged and skipped. The API starts and serves everything else rather than
refusing to boot.

---

## Error Handling
- **400 Bad Request**: invalid input.
- **401 Unauthorized**: bad stats token.
- **404 Not Found**: no matching account in `known.json`.
- **500 Internal Server Error**: unexpected exceptions.
- **502 Bad Gateway**: all resolvers failed.
- **503 Service Unavailable**: stats logs requested with no `STATS_TOKEN` set.

---

## Security
- CORS defaults to `*`; set `STEAMTOOL_ORIGIN` to restrict it. The frontend is
  same-origin through the proxy, so the wildcard buys nothing in production.
- Log access is token-gated and fails closed.
- Resolver failure detail is logged, not returned to the client.
- `POST /api/visitor-count` is unauthenticated and therefore inflatable. Treat
  the number as decorative, or rate-limit it — which requires
  `TRUST_PROXY_HOPS` to be correct first.

---

## Performance
- 6-second overall budget per vanity resolution.
- Vanity results are **not** cached; every lookup queries third parties live.
- **Rate limiting**: not implemented. Worth adding — the API turns one cheap
  inbound request into up to five outbound ones from this server's IP.
