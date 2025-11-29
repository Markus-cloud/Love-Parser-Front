# Love Parser API Specification

The Love Parser backend exposes a versioned REST API under `/api/v1` for authenticated requests plus unauthenticated probes (`/health`, `/metrics`, `/api/v1/telegram/auth/*`, `/api/v1/subscriptions/plans`, `/api/v1/subscriptions/webhook/robokassa`). All JSON payloads are UTF-8 encoded unless stated otherwise (CSV exports or Server-Sent Events).

## Authentication

- **Scheme**: JWT access tokens signed with `HS256`.
- **Header**: `Authorization: Bearer <token>`.
- **Issuance**: Tokens are returned by `POST /api/v1/telegram/auth/verify-code` after the Telegram login completes.
- **Revocation**: `/api/v1/auth/logout` adds the bearer token to a Redis blacklist until it expires.
- **User resolution**: Authenticated routes chain `verifyJWT` and `getCurrentUser`, so your token must match a persisted user.

## Error model

Every error is normalized by `errorHandler` and follows the structure below:

```json
{
  "error": {
    "message": "Human readable text",
    "code": "VALIDATION_ERROR",
    "statusCode": 422,
    "details": {},
    "requestId": "9b6a6fb9-5b0b-4b0e-a96d-6c5f9fc072ad"
  }
}
```

| Code | HTTP status | Trigger |
| --- | --- | --- |
| `AUTH_ERROR` | 401 | Missing or invalid bearer token, revoked token, user not found. |
| `RATE_LIMIT_EXCEEDED` | 429 | Redis-backed per-identifier limiter or Telegram send-code limiter exceeded. |
| `SUBSCRIPTION_REQUIRED` | 402 | Parsing/Audience routes when the user lacks an active subscription. |
| `VALIDATION_ERROR` | 422 | Zod schema validation failure or Robokassa metadata issues. |
| `NOT_FOUND` | 404 | Missing resources (search, segment, payment, user). |
| `FORBIDDEN` | 403 | Robokassa webhook with invalid merchant login or unauthorized actions. |
| `SERVICE_UNAVAILABLE` | 503 | Upstream dependencies (DB/Redis/Telegram) unavailable. |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled exceptions. |
| `INVALID_PHONE_NUMBER`, `PHONE_NUMBER_OCCUPIED`, `SESSION_PASSWORD_NEEDED`, `INVALID_CODE`, `CODE_INVALID`, `CODE_EXPIRED`, `PHONE_MIGRATE` | 400/401 | Telegram RPC-specific failures mapped to friendly codes. |

## OpenAPI 3.1 snapshot

```yaml
openapi: 3.1.0
info:
  title: Love Parser API
  version: "1.0.0"
servers:
  - url: http://localhost:3000
    description: Local development
  - url: https://api.love-parser.example
    description: Production
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    ErrorResponse:
      type: object
      properties:
        error:
          type: object
          properties:
            message:
              type: string
            code:
              type: string
            statusCode:
              type: integer
            details:
              nullable: true
            requestId:
              type: string
          required: [message, code, statusCode]
    TelegramSendCodeRequest:
      type: object
      required: [phone_number]
      properties:
        phone_number:
          type: string
          example: "+79991112233"
    TelegramSendCodeResponse:
      type: object
      properties:
        auth_session_id:
          type: string
          format: uuid
        phone_code_hash:
          type: string
    TelegramVerifyRequest:
      type: object
      required: [auth_session_id, code]
      properties:
        auth_session_id:
          type: string
          format: uuid
        code:
          type: string
        password:
          type: string
          nullable: true
    TelegramVerifyResponse:
      type: object
      properties:
        access_token:
          type: string
        user:
          $ref: '#/components/schemas/AuthUser'
    AuthUser:
      type: object
      properties:
        id: { type: string, format: uuid }
        phone_number: { type: string, nullable: true }
        telegram_id: { type: string, nullable: true }
        telegram_username: { type: string, nullable: true }
        telegram_profile_photo_id: { type: string, nullable: true }
        first_name: { type: string, nullable: true }
        last_name: { type: string, nullable: true }
        subscription:
          $ref: '#/components/schemas/SubscriptionSummary'
        limits:
          type: object
        is_active: { type: boolean }
    SubscriptionSummary:
      type: object
      properties:
        plan_type: { type: string, nullable: true }
        status: { type: string, nullable: true }
        expires_at: { type: string, format: date-time, nullable: true }
    DashboardResponse:
      type: object
      properties:
        user_profile:
          type: object
          properties:
            name: { type: string, nullable: true }
            username: { type: string, nullable: true }
            photo_url: { type: string, nullable: true }
            phone: { type: string, nullable: true }
        subscription:
          type: object
          properties:
            plan: { type: string, enum: [free, week, month, year] }
            status: { type: string, enum: [active, expired] }
            expires_at: { type: string, format: date-time, nullable: true }
            renewal_status: { type: string, enum: [auto, manual, expired] }
        limits:
          type: object
          properties:
            parsing_limit: { oneOf: [{ type: integer }, { type: string, enum: [unlimited] }] }
            parsing_used: { type: integer }
            audience_limit: { oneOf: [{ type: integer }, { type: string, enum: [unlimited] }] }
            audience_used: { type: integer }
            broadcast_limit: { oneOf: [{ type: integer }, { type: string, enum: [unlimited] }] }
            broadcast_used: { type: integer }
        stats:
          type: object
          properties:
            total_channels_found: { type: integer }
            total_audience_analyzed: { type: integer }
            total_broadcasts_sent: { type: integer }
            recent_activity:
              type: array
              items:
                type: object
                properties:
                  type: { type: string }
                  name: { type: string }
                  created_at: { type: string, format: date-time }
                  status: { type: string }
    ParsingFilters:
      type: object
      properties:
        language: { type: string }
        min_subscribers: { type: integer }
        max_subscribers: { type: integer }
        activity_level: { type: string, enum: [low, medium, high] }
    ParsingSearchRequest:
      type: object
      required: [query]
      properties:
        query:
          type: string
          minLength: 2
          maxLength: 512
        filters:
          $ref: '#/components/schemas/ParsingFilters'
    ParsingHistoryEntry:
      type: object
      properties:
        id: { type: string, format: uuid }
        query: { type: string }
        filters: { $ref: '#/components/schemas/ParsingFilters' }
        status: { type: string, enum: [pending, processing, completed, failed] }
        created_at: { type: string, format: date-time }
        results_count: { type: integer }
    ParsedChannel:
      type: object
      properties:
        channel_id: { type: string }
        title: { type: string, nullable: true }
        username: { type: string, nullable: true }
        subscribers: { type: integer }
        description: { type: string, nullable: true }
        activity_score: { type: number }
        activity_level: { type: string, enum: [low, medium, high] }
        last_post: { type: string, format: date-time, nullable: true }
    ParsingResultsResponse:
      type: object
      properties:
        total: { type: integer }
        page: { type: integer }
        limit: { type: integer }
        results:
          type: array
          items:
            $ref: '#/components/schemas/ParsedChannel'
    ParsingProgress:
      type: object
      properties:
        searchId: { type: string }
        status: { type: string, enum: [pending, initializing, scanning_channels, analyzing_data, completed, failed] }
        progress: { type: integer }
        current: { type: integer }
        total: { type: integer }
        results: { type: integer }
        updated_at: { type: string, format: date-time }
    AudienceSegment:
      type: object
      properties:
        id: { type: string }
        name: { type: string }
        description: { type: string, nullable: true }
        source_parsing_id: { type: string, nullable: true }
        filters:
          type: object
        total_recipients: { type: integer }
        status: { type: string, enum: [ready, processing, failed] }
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time }
    AudiencePreview:
      type: object
      properties:
        total: { type: integer }
        preview:
          type: array
          items:
            type: object
            properties:
              username: { type: string, nullable: true }
              user_id: { type: string }
              engagement_score: { type: number }
              activity_level: { type: string }
    SubscriptionPlan:
      type: object
      properties:
        type: { type: string, enum: [free, week, month, year] }
        name: { type: string }
        price: { type: number }
        currency: { type: string }
        limits:
          type: object
    PurchaseResponse:
      type: object
      properties:
        payment_id: { type: string }
        robokassa_url: { type: string }
        order_id: { type: string }
paths:
  /health:
    get:
      summary: Basic health probe
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
      tags: [Observability]
  /api/health:
    get:
      summary: Namespaced health probe
      responses:
        '200': { $ref: '#/paths/~1health/get/responses/200' }
  /api/health/db:
    get:
      summary: PostgreSQL health
      responses:
        '200':
          description: Database reachable
          content:
            application/json:
              schema:
                type: object
                properties:
                  status: { type: string }
                  response_time: { type: integer }
  /api/health/redis:
    get:
      summary: Redis health
      responses:
        '200':
          description: Redis reachable
          content:
            application/json:
              schema:
                type: object
                properties:
                  status: { type: string }
                  response_time: { type: integer }
  /api/health/telegram:
    get:
      summary: Telegram connectivity + active session count
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  status: { type: string }
                  active_sessions: { type: integer }
  /metrics:
    get:
      summary: Prometheus metrics
      responses:
        '200':
          description: Prometheus text format
          content:
            text/plain:
              schema:
                type: string
      tags: [Observability]
  /api/v1/telegram/auth/send-code:
    post:
      summary: Request Telegram login code
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/TelegramSendCodeRequest' }
      responses:
        '200':
          description: Code emitted
          content:
            application/json:
              schema: { $ref: '#/components/schemas/TelegramSendCodeResponse' }
        '400': { $ref: '#/components/schemas/ErrorResponse' }
      tags: [Telegram Auth]
  /api/v1/telegram/auth/verify-code:
    post:
      summary: Complete Telegram auth and mint JWT
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/TelegramVerifyRequest' }
      responses:
        '200':
          description: Access token issued
          content:
            application/json:
              schema: { $ref: '#/components/schemas/TelegramVerifyResponse' }
      tags: [Telegram Auth]
  /api/v1/auth/me:
    get:
      summary: Current authenticated user
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Profile snapshot
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AuthUser' }
      tags: [Auth]
  /api/v1/auth/logout:
    get:
      summary: Revoke the current JWT
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Logout success
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
      tags: [Auth]
  /api/v1/dashboard/:
    get:
      summary: Dashboard aggregates
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Dashboard payload
          content:
            application/json:
              schema: { $ref: '#/components/schemas/DashboardResponse' }
      tags: [Dashboard]
  /api/v1/parsing/search:
    post:
      summary: Create a parsing job
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ParsingSearchRequest' }
      responses:
        '202':
          description: Job accepted
          content:
            application/json:
              schema:
                type: object
                properties:
                  search_id: { type: string }
                  status: { type: string }
                  progress: { type: integer }
      tags: [Parsing]
  /api/v1/parsing/history:
    get:
      summary: Paginated history
      security:
        - bearerAuth: []
      parameters:
        - in: query
          name: page
          schema: { type: integer, minimum: 1, default: 1 }
        - in: query
          name: limit
          schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
      responses:
        '200':
          description: History entries
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/ParsingHistoryEntry' }
      tags: [Parsing]
  /api/v1/parsing/{search_id}/results:
    get:
      summary: Parsed channels for a search
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: search_id
          required: true
          schema: { type: string, format: uuid }
        - in: query
          name: page
          schema: { type: integer, minimum: 1, default: 1 }
        - in: query
          name: limit
          schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
        - in: query
          name: sort_by
          schema: { type: string, enum: [subscribers, activity], default: subscribers }
      responses:
        '200':
          description: Paginated channels
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ParsingResultsResponse' }
      tags: [Parsing]
  /api/v1/parsing/{search_id}/export:
    get:
      summary: Export parsing results as CSV
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: search_id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: CSV payload
          content:
            text/csv:
              schema: { type: string, format: binary }
      tags: [Parsing]
  /api/v1/parsing/{search_id}/progress:
    get:
      summary: Stream parsing progress over SSE
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: search_id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Event stream
          content:
            text/event-stream:
              schema: { $ref: '#/components/schemas/ParsingProgress' }
      tags: [Parsing]
  /api/v1/audience/segments:
    get:
      summary: List segments
      security:
        - bearerAuth: []
      parameters:
        - in: query
          name: page
          schema: { type: integer, default: 1 }
        - in: query
          name: limit
          schema: { type: integer, default: 20 }
      responses:
        '200':
          description: Segment summaries
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/AudienceSegment' }
      tags: [Audience]
    post:
      summary: Create a segment
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, source_parsing_id]
              properties:
                name: { type: string }
                description: { type: string }
                source_parsing_id: { type: string }
                filters:
                  $ref: '#/components/schemas/ParsingFilters'
      responses:
        '201':
          description: Segment created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AudienceSegment' }
  /api/v1/audience/{segment_id}:
    get:
      summary: Segment detail
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: segment_id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Detail
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AudienceSegment' }
    put:
      summary: Update filters / refresh totals
      security:
        - bearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                filters:
                  $ref: '#/components/schemas/ParsingFilters'
      responses:
        '200': { $ref: '#/components/schemas/AudienceSegment' }
    delete:
      summary: Delete segment
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Deleted
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
  /api/v1/audience/{segment_id}/preview:
    get:
      summary: Sample recipients for a segment
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: segment_id
          required: true
          schema: { type: string }
        - in: query
          name: limit
          schema: { type: integer, default: 10 }
      responses:
        '200':
          description: Preview data
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AudiencePreview' }
  /api/v1/subscriptions/plans:
    get:
      summary: Public pricing table
      responses:
        '200':
          description: Available plans
          content:
            application/json:
              schema:
                type: object
                properties:
                  plans:
                    type: array
                    items: { $ref: '#/components/schemas/SubscriptionPlan' }
      tags: [Subscriptions]
  /api/v1/subscriptions/current:
    get:
      summary: Current subscription snapshot
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Summary
          content:
            application/json:
              schema:
                type: object
                properties:
                  plan_type: { type: string }
                  status: { type: string }
                  expires_at: { type: string, format: date-time, nullable: true }
                  renewal_status: { type: string }
                  auto_renewal_enabled: { type: boolean }
      tags: [Subscriptions]
  /api/v1/subscriptions/purchase:
    post:
      summary: Start a Robokassa purchase
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [plan_type]
              properties:
                plan_type:
                  type: string
                  enum: [week, month, year]
      responses:
        '200':
          description: Redirect info
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PurchaseResponse' }
      tags: [Subscriptions]
  /api/v1/subscriptions/webhook/robokassa:
    post:
      summary: Robokassa result URL
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                MerchantLogin: { type: string }
                SignatureValue: { type: string }
                InvId: { type: string }
                OutSum: { type: string }
                Sum: { type: string }
                Culture: { type: string }
                IsTest: { type: string }
      responses:
        '200':
          description: ACK for Robokassa
          content:
            application/json:
              schema:
                type: object
                properties:
                  result: { type: string }
      tags: [Subscriptions]
```

## Endpoint reference & examples

### Health & observability
- `GET /health` and `GET /api/health` – lightweight heartbeat.
- `GET /api/health/db|redis|telegram` – returns `{ status: "ok", response_time: 12 }` or `active_sessions` for Telegram.
- `GET /metrics` – Prometheus text exposition (no auth) with HTTP/queue/DB gauges.

### Telegram authentication

```http
POST /api/v1/telegram/auth/send-code
Content-Type: application/json

{ "phone_number": "+79992223344" }
```

Response:

```json
{ "auth_session_id": "1c5ce1ef-3e0f-4ea9-9f59-874875f3b1e1", "phone_code_hash": "a1b2c3" }
```

```http
POST /api/v1/telegram/auth/verify-code
Authorization: none

{ "auth_session_id": "1c5c...", "code": "12345" }
```

Response includes `access_token` plus a hydrated user profile.

### Auth session endpoints
- `GET /api/v1/auth/me` – returns the enriched `AuthUser` with subscription + quota summary.
- `GET /api/v1/auth/logout` – invalidates the bearer token.

### Dashboard

```http
GET /api/v1/dashboard/
Authorization: Bearer <token>
```

Response snippet:

```json
{
  "user_profile": { "name": "Olga", "username": "@olga", "photo_url": null, "phone": "+7999" },
  "subscription": { "plan": "month", "status": "active", "expires_at": "2024-12-01T12:00:00Z", "renewal_status": "manual" },
  "limits": { "parsing_limit": 100, "parsing_used": 12, "audience_limit": 20, "audience_used": 3, "broadcast_limit": "unlimited", "broadcast_used": 0 },
  "stats": {
    "total_channels_found": 8421,
    "total_audience_analyzed": 128900,
    "total_broadcasts_sent": 37,
    "recent_activity": [
      { "type": "parsing", "name": "crypto", "created_at": "2024-11-28T10:00:00Z", "status": "completed" }
    ]
  }
}
```

### Parsing

1. **Create search** – `POST /api/v1/parsing/search` with `{ "query": "crypto", "filters": { "min_subscribers": 1000, "language": "en" } }` returns `202` with `search_id`.
2. **History** – `GET /api/v1/parsing/history?page=1&limit=20` returns an array of summaries.
3. **Results** – `GET /api/v1/parsing/{search_id}/results?sort_by=activity` returns paginated channels.
4. **Export** – `GET /api/v1/parsing/{search_id}/export` downloads `text/csv`.
5. **Progress SSE** – `GET /api/v1/parsing/{search_id}/progress` keeps the connection open and emits snapshots like `data: {"status":"analyzing_data","progress":80,...}` each second.

### Audience segments

- **Create** `POST /api/v1/audience/segments`

```json
{
  "name": "VIP crypto",
  "description": "High engagement & +10k subs",
  "source_parsing_id": "3f7f...",
  "filters": { "engagement_min": 0.4, "min_subscribers": 10000 }
}
```

- **List** `GET /api/v1/audience/segments` – returns `[{ "id": "...", "name": "VIP crypto", "total_recipients": 542, "status": "ready", ... }]`.
- **Detail/Update/Delete** – operate on `/api/v1/audience/{segment_id}`.
- **Preview** – `GET /api/v1/audience/{segment_id}/preview?limit=25` responds with `{ "total": 542, "preview": [{ "username": "@alpha", "user_id": "123456789", "engagement_score": 0.82, "activity_level": "high" }] }`.

### Subscriptions & billing

- `GET /api/v1/subscriptions/plans` – public list of plan cards.
- `GET /api/v1/subscriptions/current` – returns plan, expiry, renewal mode.
- `POST /api/v1/subscriptions/purchase` – accepts `{ "plan_type": "month" }` and returns a Robokassa redirect link.
- `POST /api/v1/subscriptions/webhook/robokassa` – Robokassa result notification, verifies signature, marks payments, upgrades usage limits, and replies `{ "result": "OK" }`.

### Health/security considerations

- Rate limiting is enforced globally via Redis; 429 responses include `Retry-After` (seconds).
- Subscription-restricted routes respond with HTTP 402 + `SUBSCRIPTION_REQUIRED`.
- SSE endpoints must support reconnect logic on the client; repeated `search_id` polls are idempotent and fall back to summary data if Redis TTL expires.

Refer to [`backend/DEPLOYMENT.md`](./DEPLOYMENT.md) for environment setup, and [`backend/ARCHITECTURE.md`](./ARCHITECTURE.md) for deeper system context.
