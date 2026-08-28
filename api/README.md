# API Documentation

## Overview
This API provides endpoints for resolving Steam IDs, looking up known accounts, and tracking visitor counts. It uses Express.js, Node.js, and open-source libraries. All requests are CORS-enabled and use JSON for data exchange.

## Endpoints

### 1. `/api/resolve-vanity` (GET)
**Purpose**: Resolve a Steam vanity URL to its ID64 by querying multiple resolvers.

**Request Parameters**:
- `id` (query): A string containing alphanumeric characters, underscores, or hyphens. Required.

**Response Examples**:
- Success (found via resolver):
  ```json
  {
    "steamid64": "123456789",
    "source": "steamid.co"
  }
  ```
- Error: Invalid ID format
  ```json
  { "error": "invalid id: only A-Z, a-z, 0-9, _, - allowed" }
  ```
- Error: No resolvers configured
  ```json
  { "error": "no resolvers configured" }
  ```
- Error: All resolvers failed
  ```json
  {
    "error": "no resolver succeeded",
    "details": [
      { "source": "cswat.ch", "error": "HTTP 404" },
      { "source": "steamid.co", "error": "Timeout" }
    ]
  }
  ```

**Resolver Configuration**:
- Resolvers are defined in `resolvers.json` (see example below).
- Each resolver has:
  - `name`: Identifier for logging.
  - `urlTemplate`: Template with `{id}` placeholder (e.g., `https://resolver.example.com/{id}`).
  - `responsePath`: Dot-separated path to extract the ID (e.g., `response.ids.steam64Id`).

**Example `resolvers.json`**:
```json
[
  {
    "name": "steamidresolver.cn",
    "urlTemplate": "https://steamidresolver.cn/profiles/{id}/",
    "responsePath": "response.ids.steam64Id"
  },
  {
    "name": "customresolver.example.com",
    "urlTemplate": "https://customresolver.example.com/lookup/{id}",
    "responsePath": "data.steamid"
  }
]
```

**Notes**:
- Resolvers are randomised to distribute load.
- If a resolver returns a numeric string or integer, it's automatically converted to a string.
- Invalid JSON responses from resolvers are parsed as text to detect numeric IDs.

---

### 2. `/api/visitor-count` (GET)

**Purpose**: Fetch the visitor count for the current day.

**Response Examples**:
- Success:
  ```json
  {
  "date": "2026-01-14",
  "count": 6
  }
  ```

---

### 3. `/api/visitor-count` (POST)

**Purpose**: Increment the visitor count for the current day.

**Response Examples**:
- Success:
  ```json
  {
  "date": "2026-01-14",
  "count": 6
  }
  ```

---

### 4. `/api/known` (GET)

**Purpose**: Fetch information about an account

**Request Parameters**:
- `id` (query): A Steam ID64 (17 digits). Required.

**Response Examples**:
- Success:
  ```json 
  {
  "ids": [ "76561198043955928" ], 
  "name": "neokCS",
  "info": [ 
    "YouTuber",
    "Twitch streamer"
    ],
  "links": [
    "twitch.tv/neok",
    "youtube.com/neokcs"
    ]
  }
  ```

---

## Configuration
- **Environment Variables**:
  - `PORT`: Server port (default: `process.env.PORT`).
  - `HOST`: Server host (default: `process.env.HOST`).
- **Dependencies**:
  - Open-source libraries: Express, body-parser, Node.js standard libraries.

---

## Error Handling
- **400 Bad Request**: Invalid input (e.g., non-numeric ID).
- **404 Not Found**: No matching account in `known.json`.
- **500 Internal Server Error**: Unexpected exceptions.
- **502 Bad Gateway**: All resolvers failed.

---

## Security
- All requests are CORS-enabled (`Access-Control-Allow-Origin: *`).
- Input sanitization prevents injection attacks (e.g., URL encoding).
- No sensitive data is exposed in logs or responses.

---

## Performance
- **Timeouts**: 5 seconds for all external requests.
- **Rate Limiting**: Not implemented; consider adding for production use.
