# API Documentation

## Overview
This API provides two endpoints for resolving Steam IDs and fetching profile data. It uses Express.js, Node.js, and open-source libraries. All requests are CORS-enabled and use JSON for data exchange.

## Endpoints

### 1. `/api/leetify` (GET)
**Purpose**: Fetch Steam profile data using a Steam ID64 from Leetify's API.

**Request Parameters**:
- `id` (query): A string containing only digits (Steam ID64). Required.

**Response Examples**:
- Success:
  ```json
  {
  "isSensitiveDataVisible": false,
  "recentGameRatings": {
    "aim": 83.39767558123408,
    "leetifyRatingRounds": 560,
    "positioning": 39.743194584961124,
    "utility": 64.00541041079873,
    "gamesPlayed": 30,
    "clutch": 0.2005,
    "ctLeetify": 0.0124,
    "leetify": 0.0223,
    "opening": -0.0064,
    "tLeetify": 0.0308
  },
  "teammates": false,
  "highlights": [],
  ...
  "meta": {
   "bannerBorderId": "none",
    "name": "a9l9gacppb5h7avyt9rs4p",
    "steam64Id": "76561199702311767",
    "steamAvatarUrl": "https://avatars.fastly.steamstatic.com/0ee067b3b0a780a32b8317d83f741dd79deee70f_full.jpg",
    "isCollector": false,
    "isLeetifyStaff": false,
    "isProPlan": false,
    "leetifyUserId": "d7e992b1-6ac7-4d6b-af0d-481fa4dc3e48",
    "subscriptionActiveSince": "2025-02-03T19:03:29.000Z",
    "vanityUrl": null,
    "platformBans": []
    }
  }
  ```
- Error: Invalid ID
  ```json
  { "error": "invalid id: must contain only digits" }
  ```
- Error: Remote server failure
  ```json
  {"error":"remote_error","details":"Not Found"}
  ```
- Error: Internal server error
  ```json
  { "error": "internal_server_error" }
  ```

**Notes**:
- Leetify API requires setting the URL (`LEETIFY_API_URL` environment variable) and an optional `Authorization` header with a Bearer token (`LEETIFY_API_KEY` environment variable).
- All requests have a 5-second timeout to prevent hanging.

---

### 2. `/api/resolve-vanity` (GET)
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

### 4. `/api/visitor-count` (GET)

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

### 4. `/api/visitor-count` (POST)

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

### 5. `/api/known` (POST)

**Purpose**: Fetch information about an account

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
  - `LEETIFY_API_URL`: Leetify API URL (provided by them)
  - `LEETIFY_API_KEY`: Optional API key for Leetify (commented in code).
- **Dependencies**:
  - Open-source libraries: Express, body-parser, Node.js standard libraries.

---

## Error Handling
- **400 Bad Request**: Invalid input (e.g., non-numeric ID).
- **404 Not Found**: Missing data in Leetify's response.
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
