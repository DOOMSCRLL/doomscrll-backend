# DOOMSCRLL Backend Documentation

This document serves as the central reference for the DOOMSCRLL backend, outlining how state flows, how the database is structured, the available API endpoints, and the unified error handling system.

---

## 1. Tech Stack & Architecture

- **Fastify** as server _(Cookies, CORS, rate limiter, raw-body parsing)_
- **PostgreSQL** as database
- **Drizzle** as ORM
- **zod** as schema verifier
- **@fastify/schedule & toad-scheduler** as background job scheduler _(DB cleanup, ephemeral sweeps)_
- **Plunk** as email delivery service
- **Cloudflare R2** as image storage and CDN _(via @aws-sdk/client-s3)_
- **Lemon Squeezy** as Merchant of Record / payment processor
- **Docker** for containers
- **Vitest** for integration testing and TDD

The backend follows a strict **Service-Controller-Route** pattern for maximum testability:

- **Routes (`src/routes`)**: Defines Fastify endpoints, HTTP methods, and Zod validation schemas.
- **Controllers (`src/controllers`)**: Manages HTTP context (Request/Reply) and passes typed payloads to services.
- **Services (`src/services`)**: Contains pure, decoupled business logic and handles direct DB/third-party API interactions.

---

## 2. Core Workflows & State Machines

The DOOMLIT architecture safely decouples the user's content journey from the financial ledger.

### Authentication Flow (Passwordless / OTP)

1. User requests a one-time password via `POST /auth/request-otp` providing their email.
2. User verifies the code via `POST /auth/verify-otp`. Upon success, the backend sets an `httpOnly`, `secure`, `lax` cookie (`session_id`) and returns a CSRF token.
3. For any subsequent authenticated mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`), the client must pass the CSRF token in the headers (typically `x-csrf-token`).

### DOOMLIT Lifecycle (`project_status` Enum)

The `projects` table acts as a highly volatile 24-hour queue.

1. **`draft` (Reservation)**: Client calls `POST /projects/reserve`.
   - **Checks**: Verifies the deadzone (no reservations for tomorrow after 23:00 UTC), daily slot limits, 14-day domain cooldown, and enforces a **maximum 1 active draft per user**.
   - **Creation**: Creates a `project_ledger` entry (if one doesn't exist for the URL) and a `projects` entry.
2. **Payment Pending**: The project is a `"draft"`. The user has 15 minutes to complete checkout. If unpaid, a background cron job (`clean-expired-drafts`) automatically deletes the draft.
3. **`incomplete` (Payment Completed)**: Lemon Squeezy sends a webhook to `POST /webhooks/lemonsqueezy`.
   - The backend verifies the signature, records a `receipts` entry, and changes the project status to `"incomplete"`.
4. **Content Upload & Editing**: The user can now request upload URLs (`POST /projects/:referenceId/upload-urls`) and patch the project details (`PATCH /projects/:referenceId`). _Note: Both "incomplete" and "ready" projects can be updated._
5. **`ready` (Publishing)**: Client calls `POST /projects/:referenceId/publish`. Validates that all required fields are filled. If successful, sets status to `"ready"` and updates the `lastShowcaseDate` on the ledger to trigger the cooldown.
6. **`canceled` (Cancellation)**: If a user cancels an active project (`DELETE /projects/:referenceId`), a `"draft"` is permanently deleted, while an `"incomplete"` or `"ready"` project is marked as `"canceled"` (retained for support/receipt purposes).
7. **Daily Reset**: Every day at 00:00 UTC, the `clean-daily-reset` cron job hard-deletes any `projects` (and their associated R2 image assets) where the `showcaseDate` is strictly less than today.

### Financial Ledger (`receipt_status` Enum)

Receipts and Ledger entries are immutable historical records. They skip the pending phase entirely.

1. `succeeded`: Payment cleared, receipt generated.
2. `refunded`: Creator was refunded via Lemon Squeezy dashboard.
3. `disputed`: Creator initiated a bank chargeback.

---

## 3. Database Schema

### `profiles`

User accounts.

- `id` (uuid, PK)
- `email` (string, Unique)
- `username` (string, Unique)
- `description` (string)
- `url` (string)
- `createdAt` (timestamp)

### `sessions` & `otp_codes`

Auth management.

- **otp_codes**: `id`, `email`, `code`, `expiresAt`
- **sessions**: `id`, `profileId` (Cascade delete on profile), `expiresAt`

### `project_ledger`

Permanent record linking a user to a specific `primaryUrl` to enforce the 14-day cooldown.

- `id` (uuid, PK)
- `profileId` (uuid)
- `primaryUrl` (string, Unique)
- `lastShowcaseDate` (date)
- `createdAt` (timestamp)

### `projects`

Ephemeral project details showcasing for a single day. Cascade deletes if `project_ledger` is deleted.

- `id` (uuid, PK)
- `referenceId` (string, Unique)
- `ledgerId` (uuid, FK)
- `showcaseDate` (date)
- `status` (Enum: `"draft"`, `"incomplete"`, `"ready"`, `"showcased"`, `"canceled"`)
- `reservedAt` (timestamp)
- _Content fields:_ `name`, `category`, `primaryPlatform`, `primaryUrl`, `description`, `tags`, `secondaryPlatforms`, `features`, `coverImagePath`, `screenshotPaths`, `videoUrl`
- `createdAt` (timestamp)

### `receipts`

Immutable payment records.

- `id` (uuid, PK)
- `profileId` (uuid)
- `ledgerId` (uuid)
- `projectReferenceId` (string)
- `showcaseDate` (date)
- `priceCents` (integer)
- `provider` (string)
- `providerTransactionId` (string)
- `receiptUrl` (string)
- `status` (Enum: `"succeeded"`, `"refunded"`, `"disputed"`)
- `createdAt` (timestamp)

---

## 4. Global Error Map

All backend endpoints format their errors consistently. When `success === false`, the response matches this schema:

```typescript
{
  success: false,
  error: {
    code: string,
    message: string,
    details?: any // Optional Zod validation issues or context
  }
}
```

### Predefined Error Codes (`src/config/errors.ts`)

| Code                   | Default Message                                                      | Trigger Condition                                    |
| :--------------------- | :------------------------------------------------------------------- | :--------------------------------------------------- |
| `INTERNAL_ERROR`       | An internal server error occurred.                                   | Unhandled exceptions or 500s.                        |
| `NOT_FOUND`            | The requested resource was not found.                                | Missing profile, project, etc.                       |
| `UNAUTHORIZED`         | You are not authorized to perform this action.                       | Missing session or manipulating another user's data. |
| `INVALID_PAYLOAD`      | The provided payload is invalid.                                     | Logic failures like booking past dates.              |
| `DEADZONE_ACTIVE`      | DOOMLIT reservations for the next day closes at 23:00.               | Booking tomorrow's slot after 23:00 UTC.             |
| `SLOT_UNAVAILABLE`     | All DOOMLIT slots have been reserved for this date.                  | Max daily slots reached.                             |
| `COOLDOWN_ACTIVE`      | A project cannot be re-showcased before 14 days...                   | Attempting to showcase a URL within 14 days.         |
| `DRAFT_LIMIT_REACHED`  | You already have an active draft.                                    | Attempting to reserve while an unpaid draft exists.  |
| `INVALID_URL`          | The provided URL does not exist or the product is not published yet. | Active validation caught a 404/400 for primaryUrl.   |
| `INVALID_STATE`        | The project is not in a valid state for this action.                 | E.g. publishing a canceled project, editing a draft. |
| `VALIDATION_FAILED`    | Missing or invalid required fields.                                  | Zod parsing failed (returns `details`).              |
| `INVALID_DATE`         | Queried date must be in the future.                                  | Fetching previews for past dates.                    |
| `SESSION_EXPIRED`      | Session expired or invalid.                                          | Expired `session_id` cookie.                         |
| `INVALID_OTP`          | Invalid or expired code.                                             | Wrong OTP code on login.                             |
| `USERNAME_TAKEN`       | That username is already taken.                                      | Updating profile to a taken handle.                  |
| `INVALID_SIGNATURE`    | Invalid webhook signature.                                           | Lemon Squeezy HMAC mismatch.                         |
| `MALFORMED_JSON`       | Malformed JSON body.                                                 | Invalid webhook body.                                |
| `MISSING_REFERENCE_ID` | Missing project reference ID in payload.                             | Webhook missing custom data.                         |

---

## 5. Endpoints Quick Reference

### Auth API (`/auth`)

- `POST /request-otp` - For sign-in/auth request. Generates and sends a 6-digit OTP to the user's email via Plunk.
- `POST /verify-otp` - For sign-in/auth verification. Validates OTP, returns `csrfToken` & Sets `session_id` Cookie.
- `POST /logout` (Protected) - Clears session cookie from DB and client.
- `GET /csrf` (Protected) - Generates a new `csrfToken` for active sessions.

### Profile API (`/profile`)

- `GET /:username` (Public) - Returns public creator profile.
- `GET /me` (Protected) - Returns profile of the authenticated user.
- `PATCH /me` (Protected) - Updates profile of the authenticated user.
- `DELETE /me` (Protected) - Hard deletes account and cascades.

### Projects API - Public (`/projects`)

- `GET /rules` - Exposes backend configuration constants (e.g., daily slot limits, deadzones, cooldown periods, max tag count, max screenshot count, file size limits, max length rules) to dynamically synchronize the frontend UI components.
- `GET /reservation-counts` - Query `{ year?, month? }`. Returns an optimized key-value map of active reservation counts per day for a given month and year, enabling the frontend calendar to instantly render slot availability.
- `GET /` - Fetches a batched feed of today's active DOOMLITs (`status = 'ready'`). Supports dynamic filtering (`category`, `tag`, and deep JSONB search for `platform`).
- `GET /preview` - Query `{ date, category }`. Returns a limited preview (name, category, tags, author) of future DOOMLITs. Fails with a 400 if requested date is in the past.
- `GET /:referenceId` - Fetches full details of a specific DOOMLIT for deep linking. Only functions on the active showcase day (`todayUtc`).

### Projects API - Protected (`/projects`)

- `GET /me` - Fetches all confirmed projects (incomplete or ready) belonging to the authenticated creator. Returns an array of limited project data (`referenceId`, `category`, `name`, `showcaseDate`, `status`). Used for populating creator menus.
- `GET /me/:referenceId` - Fetches the full database schema for a single project owned by the authenticated creator. Used by the frontend to safely populate the update form with existing content.
- `POST /reserve` - The transaction bouncer. Verifies UTC deadzones, enforces the 256 daily slot limit, enforces **max 1 draft rule**, and checks the `project_ledger` for the 14-day anti-abuse cooldown. Creates a `"draft"` and returns the `referenceId`.
- `GET /drafts/active` - Fetches the `referenceId` and `reservedAt` of a creator's active unpaid draft. Dynamically filters out drafts older than 15 minutes to prevent expiration leaks before the hourly cron job runs.
- `GET /drafts/:referenceId` - Fetches a creator's own active draft (or paid incomplete project). Used heavily during the payment flow to verify checkout states. Dynamically checks for 15-minute expiration.
- `DELETE /:referenceId` - Cancels the project (hard delete for unpaid drafts, `"canceled"` status update for paid).
- `POST /:referenceId/upload-urls` - The CDN broker. Generates and returns time-limited, pre-signed Cloudflare R2 URLs for direct client-to-CDN `.webp` image uploads, along with their final public CDN URLs.
- `PATCH /:referenceId` - Auto-save route. Accepts partial content payloads to update the database row.
- `POST /:referenceId/publish` - The final lock-in. Validates the existing database row against the strict Zod publish schema. If all required content is present, flips the status to `"ready"`.

### Webhooks API (`/webhooks`)

- `POST /lemonsqueezy` - Passive listener for payment events. Expects a raw body to verify the Lemon Squeezy cryptographic `X-Signature`. Upon a successful `order_created` event, extracts the DOOMLIT `referenceId` from `custom_data`, updates the project to `"incomplete"`, and writes an immutable `receipt`.
  - _Note:_ The backend dynamically verifies the signature against `LEMONSQUEEZY_TEST_WEBHOOK_SECRET` or `LEMONSQUEEZY_LIVE_WEBHOOK_SECRET` based on the payload's `meta.test_mode` flag. If `NODE_ENV=production`, test-mode webhooks are instantly rejected with a 200 OK to prevent database pollution.
