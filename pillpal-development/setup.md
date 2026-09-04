# PILLPAL Development Setup

This document records the versions and configuration currently used by the PILLPAL development environment so the project can be reproduced on another device.

## 1. Required Runtime

| Tool    | Required Version          |
| ------- | ------------------------- |
| Node.js | `26.7.0`                  |
| npm     | `11.19.0`                 |
| Git     | Latest stable recommended |

Check the installed versions:

```bash
node -v
npm -v
git --version
```

Expected:

```text
Node.js: v26.7.0
npm:     11.19.0
```

---

## 2. Project Stack

| Technology / Package | Version   |
| -------------------- | --------- |
| Turborepo            | `2.10.12` |
| TypeScript (root)    | `7.0.2`   |
| React                | `19.2.8`  |
| React DOM            | `19.2.8`  |
| Vite                 | `8.2.2`   |
| Prisma               | `6.19.3`  |
| @prisma/client       | `6.19.3`  |
| tsx                  | `4.20.5`  |
| @types/node          | `24.13.3` |

### Planned / Current Technologies

* React + Vite
* Node.js backend
* TypeScript
* Turborepo
* npm workspaces
* Supabase Auth
* Prisma ORM
* NeonDB / PostgreSQL
* React Native + Expo — **deferred**

---

## 3. PILLPAL Architecture

```text
PILLPAL
│
├── Turborepo
├── npm Workspaces
│
├── Web
│   ├── React + Vite
│   ├── Admin Web
│   └── Patient Web
│
├── Backend
│   └── Node.js + TypeScript
│
├── Authentication
│   └── Supabase Auth
│
├── Database
│   ├── Prisma ORM
│   └── NeonDB / PostgreSQL
│
└── Mobile
    └── React Native + Expo
        (Deferred)
```

---

## 4. Repository Structure

```text
pillpal-development/
│
├── .env
├── .gitignore
├── package.json
├── package-lock.json
├── turbo.json
│
├── apps/
│   ├── admin-web/
│   │   └── React + Vite
│   │
│   ├── patient-web/
│   │   └── React + Vite
│   │
│   └── api/
│       └── Node.js + TypeScript
│
└── packages/
    ├── database/
    │   └── Prisma + NeonDB
    │
    ├── auth/
    │   └── Supabase Auth
    │
    ├── types/
    │
    ├── ui/
    │
    ├── eslint-config/
    │
    └── typescript-config/
```

> `patient-mobile` is planned but currently deferred.

---

# 5. npm Workspaces

PILLPAL uses **npm workspaces**, not pnpm.

The root `package.json` contains:

```json
{
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

### Important

Install dependencies from the **repository root**:

```bash
npm install
```

Do not run separate `npm install` commands inside every workspace unless specifically required.

npm may hoist dependencies into:

```text
pillpal-development/node_modules/
```

Therefore, a package may not always have its own local:

```text
packages/database/node_modules/
```

This is normal for npm workspaces.

---

# 6. Admin Web

Location:

```text
apps/admin-web/
```

Technology:

```text
React
React DOM
Vite
TypeScript
```

Current core versions:

```text
React:       ^19.2.8
React DOM:   ^19.2.8
Vite:        ^8.2.2
TypeScript:  ~6.0.2
```

Scripts:

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

---

# 7. Patient Web

Location:

```text
apps/patient-web/
```

Technology:

```text
React
React DOM
Vite
TypeScript
```

Current core versions:

```text
React:       ^19.2.8
React DOM:   ^19.2.8
Vite:        ^8.2.2
TypeScript:  ~6.0.2
```

Scripts:

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

---

# 8. Node.js API

Location:

```text
apps/api/
```

The backend uses **Node.js directly**.

We are **not using Express or Fastify**.

Current versions:

```text
Node.js:     26.7.0
TypeScript:  ~6.0.2
tsx:         ^4.20.5
@types/node: ^24.13.3
```

API structure:

```text
apps/api/
└── src/
    ├── controllers/
    ├── routes/
    ├── services/
    └── server.ts
```

Scripts:

```bash
npm run dev
npm run build
npm run start
npm run check-types
```

The development server currently runs on:

```text
http://localhost:4000
```

Health endpoint:

```text
GET /health
```

---

# 9. Prisma + Database

Location:

```text
packages/database/
```

Current Prisma versions:

```text
prisma:          6.19.3
@prisma/client:  6.19.3
```

### Important Prisma rule

Keep these two packages on the **same version**:

```text
prisma
@prisma/client
```

Current required version:

```text
6.19.3
```

Do not independently upgrade one without the other.

---

# 10. Prisma Structure

Current database package:

```text
packages/database/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── prisma.config.ts
└── package.json
```

The Prisma schema is located at:

```text
packages/database/prisma/schema.prisma
```

---

# 11. Database Environment Variables

The `.env` file belongs at the **repository root**:

```text
pillpal-development/
└── .env
```

It should contain the Neon PostgreSQL connection:

```env
DATABASE_URL="your-neon-postgresql-connection-string"
```

Example format:

```env
DATABASE_URL="postgresql://username:password@host/neondb?sslmode=require"
```

### Security

Never commit `.env` to Git.

Do not share the actual `DATABASE_URL` publicly because it contains database credentials.

When setting up PILLPAL on another device, create a new root `.env` file and add the appropriate Neon connection string.

---

# 12. Prisma Configuration

`packages/database/prisma.config.ts` currently uses:

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

The Prisma schema currently uses:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

---

# 13. Prisma Commands

Run these commands from:

```text
packages/database/
```

### Validate schema

```bash
npx prisma validate
```

### Generate Prisma Client

```bash
npx prisma generate
```

### Create a development migration

```bash
npx prisma migrate dev
```

### Push schema directly

```bash
npx prisma db push
```

### Open Prisma Studio

```bash
npx prisma studio
```

### Introspect an existing database

```bash
npx prisma db pull
```

---

# 14. Current NeonDB Status

The NeonDB connection has already been successfully tested.

Prisma detected:

```text
PostgreSQL database "neondb"
schema "public"
```

The database was initially empty, resulting in:

```text
P4001 The introspected database was empty
```

This is expected for a new database.

It does **not** indicate a connection failure.

The intended workflow is:

```text
Prisma Schema
      ↓
Prisma Migration
      ↓
NeonDB
      ↓
PostgreSQL Tables
```

We will define PILLPAL's models in `schema.prisma` and then migrate them to NeonDB.

---

# 15. Current User Model

The initial Prisma schema contains the basic `User` model:

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  firstName String
  lastName  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

This is only the **initial database foundation**.

The complete authentication and role structure will be finalized during the authentication phase.

---

# 16. Fresh Device Setup

After cloning the repository:

```bash
git clone <repository-url>
cd pillpal-development
```

Check Node.js:

```bash
node -v
```

Expected:

```text
v26.7.0
```

Check npm:

```bash
npm -v
```

Expected:

```text
11.19.0
```

Install dependencies:

```bash
npm install
```

Create the root environment file:

```text
pillpal-development/.env
```

Add:

```env
DATABASE_URL="your-neon-postgresql-connection-string"
```

Then verify Prisma:

```bash
cd packages/database
npx prisma version
```

Expected:

```text
prisma                  : 6.19.3
@prisma/client          : 6.19.3
```

Return to the root:

```bash
cd ../..
```

---

# 17. Development Commands

From the repository root:

### Start development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

### Type checking

```bash
npm run check-types
```

---

# 18. Version Policy

To keep the project reproducible across development devices:

### Use these versions

```text
Node.js       26.7.0
npm           11.19.0
Turborepo     2.10.12
Prisma        6.19.3
@prisma/client 6.19.3
```

### Follow these rules

1. Use **npm**, not pnpm.
2. Use **Node.js 26.7.0**.
3. Install dependencies from the repository root.
4. Keep `prisma` and `@prisma/client` on the same version.
5. Do not commit `.env`.
6. Keep `.env` at the repository root.
7. Do not introduce Next.js for the web applications.
8. Do not introduce Express or Fastify for the API.
9. Do not set up React Native/Expo until the mobile phase begins.
10. Do not upgrade major dependencies without checking compatibility with the entire monorepo.

---

# 19. Current Project Status

| Component          | Status                |
| ------------------ | --------------------- |
| Turborepo          | ✅ Set up              |
| npm workspaces     | ✅ Set up              |
| Node.js            | ✅ `26.7.0`            |
| Admin Web          | ✅ React + Vite        |
| Patient Web        | ✅ React + Vite        |
| Node.js API        | ✅ Working             |
| Prisma             | ✅ `6.19.3`            |
| Prisma Client      | ✅ `6.19.3`            |
| NeonDB             | ✅ Connection verified |
| Prisma schema      | ✅ Valid               |
| Database migration | ⏳ Not yet finalized   |
| Supabase Auth      | ⏳ Next agenda         |
| Patient Mobile     | ⏸ Deferred            |

---

# 20. Next Development Agenda — Authentication

The next development phase is:

```text
Supabase Auth
      ↓
Authentication
      ↓
User Identity
      ↓
Role / Authorization
      ↓
Node.js API
      ↓
Admin Web + Patient Web
```

Authentication will cover:

* Sign up
* Sign in
* Sign out
* Session handling
* Protected routes
* User identity
* Role-based authorization
* Admin access
* Patient access
* Integration with the PILLPAL database

The authentication architecture will be finalized before implementing the full PILLPAL user and role system.
