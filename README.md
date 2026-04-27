# 📡 Content Broadcasting System

A backend system for educational content broadcasting — teachers upload content, principals approve it, and students access it live via a public API with subject-based rotation scheduling.

## Tech Stack

- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Auth**: JWT + bcrypt
- **File Upload**: multer (local disk storage)
- **Rate Limiting**: express-rate-limit

---

## Quick Start

### 1. Prerequisites

- Node.js >= 18
- PostgreSQL >= 14 running locally

### 2. Clone & Install

```bash
git clone <your-repo-url>
cd content-broadcasting-system
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your PostgreSQL credentials and JWT secret
```

**`.env` fields:**

| Variable          | Default              | Description                       |
|-------------------|----------------------|-----------------------------------|
| `PORT`            | `3000`               | Server port                       |
| `DB_HOST`         | `localhost`          | PostgreSQL host                   |
| `DB_PORT`         | `5432`               | PostgreSQL port                   |
| `DB_NAME`         | `content_broadcasting` | Database name                   |
| `DB_USER`         | `postgres`           | DB username                       |
| `DB_PASSWORD`     | *(required)*         | DB password                       |
| `JWT_SECRET`      | *(required)*         | Strong random string              |
| `JWT_EXPIRES_IN`  | `7d`                 | Token expiry                      |
| `MAX_FILE_SIZE_MB`| `10`                 | Max upload size in MB             |
| `UPLOAD_DIR`      | `uploads`            | Local upload directory            |

### 4. Create Database

```bash
psql -U postgres -c "CREATE DATABASE content_broadcasting;"
```

### 5. Run Migrations

```bash
npm run migrate
```

### 6. Seed Test Users

```bash
npm run seed
```

**Default credentials:**

| Role      | Email                     | Password      |
|-----------|---------------------------|---------------|
| Principal | principal@school.com      | principal123  |
| Teacher 1 | teacher1@school.com       | teacher123    |
| Teacher 2 | teacher2@school.com       | teacher123    |
| Teacher 3 | teacher3@school.com       | teacher123    |

### 7. Start the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server runs at: `http://localhost:3000`

---

## API Reference

### Health Check

```
GET /health
```

---

### Auth

#### Login
```
POST /auth/login
Content-Type: application/json

{
  "email": "teacher1@school.com",
  "password": "teacher123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGci...",
    "user": { "id": 2, "name": "Teacher One", "role": "teacher" }
  }
}
```

#### Get Current User
```
GET /auth/me
Authorization: Bearer <token>
```

---

### Content (Teacher)

#### Upload Content
```
POST /content/upload
Authorization: Bearer <teacher-token>
Content-Type: multipart/form-data

Fields:
  title             (required) string
  file              (required) .jpg/.png/.gif, max 10MB
  subject           (required) string e.g. "maths", "science"
  description       (optional) string
  start_time        (optional) ISO 8601 datetime e.g. "2026-04-27T09:00:00Z"
  end_time          (optional) ISO 8601 datetime e.g. "2026-04-27T17:00:00Z"
  rotation_duration (optional) integer, minutes per rotation (default: 5)
```

> **Note:** Content without `start_time`/`end_time` will never appear in live feed even if approved.

#### View My Content
```
GET /content/my
Authorization: Bearer <teacher-token>

Query params (all optional):
  status  = pending | approved | rejected
  subject = maths
  page    = 1
  limit   = 20
```

---

### Content (Principal)

#### View All Content
```
GET /content
Authorization: Bearer <principal-token>

Query params (all optional):
  status     = pending | approved | rejected
  teacher_id = 2
  subject    = maths
  page       = 1
  limit      = 20
```

#### View Single Content
```
GET /content/:id
Authorization: Bearer <token>
```

#### Approve Content
```
PATCH /content/:id/approve
Authorization: Bearer <principal-token>
```

#### Reject Content
```
PATCH /content/:id/reject
Authorization: Bearer <principal-token>
Content-Type: application/json

{
  "reason": "Image quality is too low."
}
```

---

### Public Broadcasting (Students — No Auth Required)

#### Get Live Content for a Teacher
```
GET /content/live/:teacherId

Query params (optional):
  subject = maths   → filter to a specific subject
```

**Successful response (content available):**
```json
{
  "success": true,
  "data": {
    "available": true,
    "teacher": "Teacher One",
    "items": [
      {
        "subject": "maths",
        "id": 3,
        "title": "Algebra Chapter 2",
        "description": "...",
        "file_url": "/uploads/content-1234567890.png",
        "file_type": "image/png",
        "start_time": "2026-04-27T09:00:00.000Z",
        "end_time": "2026-04-27T17:00:00.000Z",
        "rotation_duration_minutes": 5
      }
    ],
    "retrieved_at": "2026-04-27T10:23:45.000Z"
  }
}
```

**No content response:**
```json
{
  "success": true,
  "data": {
    "available": false,
    "message": "No content available.",
    "items": []
  }
}
```

**Rate limit:** 60 requests per minute per IP.

---

## Scheduling Logic

Content rotation is **deterministic and stateless** — no cron jobs or background processes are needed.

The system uses the **slot creation time as a fixed epoch** and calculates which content is active based on the current time:

```
position = (now - slot_epoch) % total_cycle_seconds
```

Example — Teacher 1, Maths (3 items, 5 min each):
```
Cycle = 15 minutes (900 seconds)
Item A: rotation slot [0s, 300s)
Item B: rotation slot [300s, 600s)
Item C: rotation slot [600s, 900s)

If 1050s have elapsed since epoch → 1050 % 900 = 150s → Item A is active
```

Each subject per teacher rotates independently.

---

## Edge Cases Handled

| Case | Behavior |
|------|----------|
| No approved content | `{ available: false, message: "No content available." }` |
| Approved but no time window set | Excluded from live feed |
| Outside time window | Excluded from live feed |
| Invalid teacher ID in URL | Returns "No content available" (not 4xx) |
| Invalid/nonexistent subject query | Returns "No content available" (not 4xx) |
| File too large | 400 with descriptive message |
| Wrong file type | 400 with descriptive message |
| Approving already-approved content | 400 with current state info |
| Teacher accessing another teacher's content | 403 |
| Expired JWT | 401 with message |

---

## Project Structure

```
content-broadcasting-system/
├── src/
│   ├── index.js                  # App entry point
│   ├── config/
│   │   └── database.js           # PostgreSQL pool
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── contentController.js
│   │   └── broadcastController.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   └── contentRoutes.js
│   ├── services/
│   │   ├── authService.js
│   │   ├── contentService.js
│   │   └── schedulingService.js  # Core rotation logic
│   ├── middlewares/
│   │   ├── auth.js               # JWT + RBAC
│   │   ├── upload.js             # multer + validation
│   │   └── errorHandler.js
│   └── utils/
│       ├── jwt.js
│       ├── response.js
│       ├── migrate.js            # npm run migrate
│       └── seed.js               # npm run seed
├── uploads/                      # Static file storage
├── architecture-notes.txt        # System design doc
├── .env.example
├── package.json
└── README.md
```

---

## Assumptions & Notes

- Teachers must set `start_time` and `end_time` on content for it to appear in the live feed. Content without a time window is considered "not scheduled" and is never broadcast (per spec).
- Subject values are normalized to lowercase on storage and lookup.
- The rotation epoch is the `content_slots.created_at` timestamp (when the first content for that teacher+subject was uploaded). This gives a deterministic, server-instance-independent rotation clock.
- File storage is local by default. For production, swap `multer` disk storage for `multer-s3` (S3 bonus feature).
- The system does not implement Redis caching (bonus) but the architecture notes describe exactly how it would be added.
