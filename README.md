# DOOMSCRLL Backend API

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Framework](https://img.shields.io/badge/Fastify-5.0-black.svg)](https://fastify.dev/)
[![Database](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![ORM](https://img.shields.io/badge/Drizzle-ORM-brightgreen.svg)](https://orm.drizzle.team/)

This repository powers the backend REST API and data service layer for the **DOOMSCRLL** ecosystem. It manages the ephemeral 24-hour project showcase queue, user OTP authentication, pre-signed Cloudflare R2 media upload brokerage, background job scheduling, and payment webhook integrations.

---

## 🌐 DOOMSCRLL Open Source Ecosystem

- **Backend API** (`doomscrll-backend`) — _You are here_
- **Landing Website** (`doomscrll-landing-website`) — Astro public portal
- **Audience Webapp** (`doomscrll-webapp-audience`) — SvelteKit 2 showcase & discovery feed
- **Creator Webapp** (`doomscrll-webapp-doomlit`) — SvelteKit 2 slot reservation & creator dashboard
- **Audience Mobile App** (`doomscrll_app_audience`) — Cross-platform Flutter MVVM mobile app

---

## 1. Tech Stack & Architecture

- **Fastify 5** as server _(Cookies, CORS, rate limiter, raw-body parsing)_
- **PostgreSQL 16** as database
- **Drizzle ORM** as schema layer
- **Zod** as runtime request validation schema
- **@fastify/schedule & toad-scheduler** for background crons _(Daily reset sweep, expired draft cleanup)_
- **Plunk** as transactional email service
- **Cloudflare R2** as object storage and CDN broker _(via AWS S3 SDK)_
- **Docker & Caddy** for containerized reverse proxy deployment
- **Vitest** for integration tests

The backend follows a strict **Service-Controller-Route** pattern:

- **Routes (`src/routes`)**: Defines Fastify endpoints, HTTP verbs, and Zod payload validation.
- **Controllers (`src/controllers`)**: Handles request/reply lifecycle and HTTP status codes.
- **Services (`src/services`)**: Encapsulates pure business logic and DB transactions.

---

## 2. Quick Start & Setup

### Prerequisites

- **Node.js**: `v20.x` or higher
- **PostgreSQL**: `v16.x` (or via Docker)

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/DOOMSCRLL/doomscrll-backend.git
   cd doomscrll-backend
   ```

2. **Configure Environment Variables**:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` to populate your local PostgreSQL database URL and development credentials.

3. **Install Dependencies**:

   ```bash
   npm install
   ```

4. **Start PostgreSQL Database (via Docker)**:

   ```bash
   docker compose up -d db
   ```

5. **Run Database Migrations & Seeds**:

   ```bash
   npx drizzle-kit push
   npm run db:seed
   ```

6. **Start Development Server**:

   ```bash
   npm run dev
   ```

   The API will be available at `http://127.0.0.1:3000`.

7. **Run Tests**:
   ```bash
   npm test
   ```

---

## 3. Core Workflows & State Machines

### Authentication Flow (Passwordless / OTP)

1. User requests a one-time password via `POST /auth/request-otp` with their email.
2. User verifies code via `POST /auth/verify-otp`. Returns a `csrfToken` and sets an `httpOnly`, `secure`, `lax` session cookie (`session_id`).
3. Authenticated mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`) require the `x-csrf-token` header.

### DOOMLIT Lifecycle (`project_status` Enum)

The `projects` table acts as a 24-hour showcase queue:

1. **`draft` (Reservation)**: Client calls `POST /projects/reserve`. Checks UTC deadzones (after 23:00 UTC), daily slot limits, and 14-day domain cooldowns.
2. **`incomplete` (Free Claim or Payment Cleared)**: Initiated via `POST /projects/:referenceId/claim-free` or payment webhook.
3. **Content Upload & Editing**: User requests pre-signed R2 upload URLs (`POST /projects/:referenceId/upload-urls`) and patches metadata (`PATCH /projects/:referenceId`).
4. **`ready` (Publishing)**: Client calls `POST /projects/:referenceId/publish`. Enforces Zod validation schema and locks in showcase queue.
5. **`canceled`**: Canceled projects are hard-deleted if draft, or marked `canceled` if published/incomplete.
6. **Daily Reset Cron**: Daily at 00:00 UTC, `clean-daily-reset` sweeps past projects and cleans R2 assets.

---

## 4. Database Schema Overview

- `profiles`: User accounts.
- `sessions` & `otp_codes`: Auth session persistence and ephemeral verification codes.
- `project_ledger`: Permanent ledger tracking primary domain URLs to enforce 14-day anti-spam cooldowns.
- `projects`: Ephemeral showcase projects.
- `receipts`: Immutable transaction ledger.

---

## 5. Endpoints Quick Reference

### Auth API (`/auth`)

- `POST /request-otp` - Sends OTP to email via Plunk.
- `POST /verify-otp` - Validates OTP, sets session cookie, returns `csrfToken`.
- `POST /logout` (Protected) - Destroys session.
- `GET /csrf` (Protected) - Refreshes CSRF token.

### Profile API (`/profile`)

- `GET /:username` (Public) - Creator profile.
- `GET /me` (Protected) - Authenticated creator profile.
- `PATCH /me` (Protected) - Update handle or user bio.

### Projects API - Public (`/projects`)

- `GET /rules` - Returns configuration limits (daily slot limit, deadzone, cooldown period).
- `GET /reservation-counts` - Monthly reservation count map.
- `GET /projects-per-category` - Category counts for a given date.
- `GET /` - Today's active showcased feed (`status = 'ready'`). Supports `category`, `tag`, and `platform` filters.
- `GET /preview` - Preview upcoming slots for future dates.
- `GET /:referenceId` - Direct project detail fetch.

### Projects API - Protected (`/projects`)

- `GET /me` - Creator's owned project history.
- `POST /reserve` - Bouncer route. Creates a 15-minute unpaid `draft`.
- `POST /:referenceId/claim-free` - Claims free launch slot.
- `POST /:referenceId/upload-urls` - Pre-signed Cloudflare R2 upload broker.
- `PATCH /:referenceId` - Auto-save project metadata.
- `POST /:referenceId/publish` - Final Zod validation and publish lock.

---

## 📄 License & Trademark Notice

- **Code License**: Source code is licensed under the [Apache License, Version 2.0](LICENSE).
- **Trademark Policy**: The **DOOMSCRLL** name, logos, brand identity, and custom design assets are reserved trademarks. See [TRADEMARK.md](TRADEMARK.md) for usage policy and rebranding guidelines for forks.
