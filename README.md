# Documentation for DOOMSCRLL backend

## Index

- [Tech Stack](#tech-stack)

- [API Endpoints](#api-endpoints)
  - [Auth API](#auth-api)
  - [Profile API](#profile-api)

---

## Tech Stack

- _Fastify_ as server (_Cookies, CORS, rate limiter, job scheduler_)
- _PostgreSQL_ as database
- _Drizzle_ as ORM
- _zod_ as schema verifier
- _Plunk_ as email delivery service
- _Docker_ as containers
- _Bruno_ for API testing

## API Endpoints

### Auth API

#### Public end-points:

- `POST /auth/request`: For sign-in/auth request. Generates and sends a 6-digit OTP to user's email, uses Plunk's API
- `POST /auth/verify`: For sign-in/auth verification. Validates OTP, returns a HTTP-only session cookie for the account. If account doesn't exist yet, creates one with sensible defaults.

#### Protected end-points:

- `POST /auth/logout`: For sign-out request. Removes active session from DB, and clears client cookie.

### Profile API

#### Public end-points:

- `GET /profile/:username`: Returns public creator information

#### Protected end-points:

- `GET /profile/me`: Returns profile of authenticated user
- `PATCH /profile/me`: Updates profile of authenticated user
- `DELETE /profile/me`: Removes profile of authenticated user. Operation cascades.
