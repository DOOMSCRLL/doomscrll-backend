# Documentation for DOOMSCRLL backend

## Index

- [Tech Stack](#tech-stack)
- [State Machines](#state-machines)
- [Automated Workers (Cron & Intervals)](#automated-workers-cron--intervals)
- [API Endpoints](#api-endpoints)
  - [Auth API](#auth-api)
  - [Profile API](#profile-api)
  - [Projects API (DOOMLITs)](#projects-api-doomlits)
  - [Webhooks API](#webhooks-api)

---

## Tech Stack

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

---

## Architecture

The backend follows a strict **Service-Controller-Route** pattern for maximum testability:

- **Routes (`src/routes`)**: Defines Fastify endpoints, HTTP methods, and Zod validation schemas.
- **Controllers (`src/controllers`)**: Manages HTTP context (Request/Reply) and passes typed payloads to services.
- **Services (`src/services`)**: Contains pure, decoupled business logic and handles direct DB/third-party API interactions.

---

## State Machines

The DOOMLIT architecture safely decouples the user's content journey from the financial ledger.

### DOOMLIT Lifecycle (`project_status` Enum)

The `projects` table acts as a highly volatile 24-hour queue.

1. `draft`: Ephemeral 15-minute reservation. Awaiting payment.
2. `incomplete`: Payment succeeded. Awaiting required content uploads.
3. `ready`: All required fields verified. Locked in for the showcase date.
4. `canceled`: Administrative override (e.g., chargeback, terms violation).
   _Note: There is no "archived" state. At 00:00 UTC the day after a showcase, the project row is permanently deleted from the database._

### Financial Ledger (`receipt_status` Enum)

Receipts and Ledger entries are immutable historical records. They skip the pending phase entirely.

1. `succeeded`: Payment cleared, receipt generated.
2. `refunded`: Creator was refunded via Lemon Squeezy dashboard.
3. `disputed`: Creator initiated a bank chargeback.

---

## Automated Workers (Cron & Intervals)

Background jobs that automatically maintain database health and enforce the platform's ephemeral rules.

- **Expired Draft Cleanup:** Runs every 1 minute. Deletes any `draft` project whose 15-minute payment reservation window has expired.
- **Auth Artifact Cleanup:** Runs every 1 hour. Wipes expired OTPs and inactive session tokens to prevent database bloat.
- **Daily Reset Cleanup:** Strict CronJob anchored to `00:00 UTC`. Identifies all DOOMLITs from the previous day, safely chunks and deletes their `.webp` assets from Cloudflare R2 to prevent storage bloat, and completely deletes the rows from the `projects` table.

---

## API Endpoints

### Auth API

#### Public end-points:

- `POST /auth/request`: For sign-in/auth request. Generates and sends a 6-digit OTP to the user's email via Plunk.
- `POST /auth/verify`: For sign-in/auth verification. Validates OTP, returns a HTTP-only session cookie. If the account doesn't exist, creates one with sensible defaults.

#### Protected end-points:

- `POST /auth/logout`: For sign-out request. Removes the active session from the DB and clears the client cookie.

---

### Profile API

#### Public end-points:

- `GET /profile/:username`: Returns public creator information.

#### Protected end-points:

- `GET /profile/me`: Returns profile of the authenticated user.
- `PATCH /profile/me`: Updates profile of the authenticated user.
- `DELETE /profile/me`: Removes profile of the authenticated user. Operation cascades.

---

### Projects API (DOOMLITs)

#### Public end-points (Consumer & System Configuration):

- `GET /projects/rules`: Exposes backend configuration constants (e.g., daily slot limits, deadzones, cooldown periods) to dynamically synchronize the frontend UI components.
- `GET /projects/reservation-counts`: Returns an optimized key-value map of active reservation counts per day for a given month and year, enabling the frontend calendar to instantly render slot availability.
- `GET /projects`: Fetches a batched feed of today's active DOOMLITs (`status = 'ready'`). Supports dynamic filtering (`category`, `tag`, and deep JSONB search for `platform`) and utilizes an MD5 hash `seed` parameter for consistent randomized pagination on the client.
- `GET /projects/preview`: Returns a limited preview (name, category, tags, author) of future DOOMLITs for a given date and category. Fails with a 400 if the requested date is today or in the past.
- `GET /projects/:referenceId`: Fetches full details of a specific DOOMLIT for deep linking. Fails with a 404 if the project is not scheduled for the current UTC day.

#### Protected end-points (Creator):

- `GET /projects/drafts/:referenceId`: Fetches a creator's own active draft (including `status` and `reservedAt` timestamps). Used heavily during the payment flow to verify checkout states.
- `POST /projects/reserve`: The transaction bouncer. Verifies UTC deadzones, enforces the 256 daily slot limit, and checks the `project_ledger` for the 14-day anti-abuse cooldown. Creates a `draft` and returns the `referenceId`.
- `POST /projects/:referenceId/upload-urls`: The CDN broker. Generates and returns time-limited, pre-signed Cloudflare R2 URLs for direct client-to-CDN `.webp` image uploads.
- `PATCH /projects/:referenceId`: Auto-save route. Accepts partial content payloads to update the database row. Does not alter the `incomplete` status.
- `POST /projects/:referenceId/publish`: The final lock-in. Validates the existing database row against the strict Zod publish schema. If all required content (description, tags, cover image) is present, flips the status to `ready`.

---

### Webhooks API

#### Public end-points:

- `POST /webhooks/lemonsqueezy`: Passive listener for payment events. Expects a raw body to verify the Lemon Squeezy cryptographic `X-Signature`. Upon a successful `order_created` event, extracts the DOOMLIT `referenceId` from `custom_data`, updates the project to `incomplete`, and writes an immutable `receipt`.
