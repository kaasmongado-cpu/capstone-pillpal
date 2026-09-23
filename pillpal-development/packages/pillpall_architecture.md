PILLPAL Development Architecture & Environment Specification

1. Purpose

This document defines the current PILLPAL development architecture,
focusing on Supabase Auth, Neon PostgreSQL, Prisma ORM, the Node.js API,
React/Vite applications, and environment-variable organization.

The goal is to keep authentication, application data, and database
access clearly separated and maintainable.

2. Overall Architecture

Admin Web / Healthcare Web / Patient Web or Mobile
                         |
                         v
                  Supabase Auth
              Authentication / Session
                         |
                         v
                    Node.js API
                    /          \
                   v            v
                Prisma     Supabase Admin API
                   |
                   v
             Neon PostgreSQL
              Application Data

Core rule

Frontend applications must not connect directly to Neon PostgreSQL.

The intended application-data flow is:

React / Mobile -> Node.js API -> Prisma -> Neon PostgreSQL

Supabase Auth handles identity and sessions.

3. Repository Structure

pillpal-development/
├── apps/
│   ├── admin-web/       # React + Vite
│   ├── healthcare-web/  # React + Vite
│   ├── patient-web/    # React + Vite
│   ├── patient-mobile/ # React Native + Expo
│   └── api/             # Node.js + TypeScript
│
├── packages/
│   ├── auth/            # Supabase Auth helpers
│   ├── database/        # Prisma schema/client
│   ├── ui/              # Shared UI
│   ├── eslint-config/
│   └── typescript-config/
│
├── .env
├── .env.example
├── package.json
├── turbo.json
└── package-lock.json

4. Supabase

Supabase is used primarily for authentication and identity
management.

It handles:

Sign up

Sign in

Sign out

Sessions

Access tokens

Provider invitations

Password setup

Authenticated user identity

Supabase is not the primary PILLPAL application database.

The application database is Neon PostgreSQL.

Authentication relationship

Every authenticated Supabase user should have a corresponding PILLPAL
User record in Neon.

Supabase Auth User
       |
       | supabaseUserId
       v
Neon User

The Prisma User model contains:

supabaseUserId String @unique

5. Neon PostgreSQL

Neon provides the PostgreSQL database used for PILLPAL application data.

Examples:

Users

Healthcare provider profiles

Roles

Work IDs

Specializations

Account status

Patients

Appointments

Medications

Adherence records

Conversations

Messages

Neon does not manage authentication.

6. Prisma

Prisma is the ORM between the Node.js API and Neon PostgreSQL.

Node.js API
     |
     v
  Prisma
     |
     v
Neon PostgreSQL

Frontend applications must never import or use Prisma directly.

The database package is:

packages/database/

and its package name is:

@pillpal/database

7. Current User Roles

PATIENT
DOCTOR
HEALTH_STAFF
ADMIN

Portal assignment:

PATIENT      -> patient-web / patient-mobile
DOCTOR       -> healthcare-web
HEALTH_STAFF -> healthcare-web
ADMIN        -> admin-web

8. Current User Types

STUDENT
EMPLOYEE
HEALTHCARE_PROVIDER

Account status:

ACTIVE
INACTIVE

9. Current User Model

Conceptually:

User
├── id
├── supabaseUserId
├── email
├── firstName
├── lastName
├── phone
├── workId
├── specialization
├── role
├── userType
├── status
├── createdAt
└── updatedAt

Important fields:

supabaseUserId: unique Supabase Auth user ID.

role: PILLPAL authorization role.

userType: broader user category.

status: PILLPAL application account state.

10. Environment Variables

Security rule

Never commit real credentials to Git.

Commit:

.env.example

Do not commit:

.env

The real .env should be ignored by Git.

11. Root .env

The current monorepo uses the root .env for shared development
environment values.

Example:

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Neon PostgreSQL
DATABASE_URL=postgresql://username:password@host/database?sslmode=require

# Vite frontend variables
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key

These are placeholders only. Never put real credentials in this
documentation.

12. Supabase Environment Variables

SUPABASE_URL

Supabase project URL.

Used by frontend and backend Supabase clients.

SUPABASE_PUBLISHABLE_KEY

Public/publishable Supabase key.

Frontend applications may use it.

For Vite:

VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key

SUPABASE_SERVICE_ROLE_KEY

Sensitive server-side credential.

Used by the Node.js API for privileged Supabase Admin operations,
including provider invitations and account management.

Never expose it to browser code.

Never create:

VITE_SUPABASE_SERVICE_ROLE_KEY=...

13. Neon Environment Variable

DATABASE_URL

Neon PostgreSQL connection string.

Example:

DATABASE_URL=postgresql://username:password@host/database?sslmode=require

It is sensitive and must only be used by server/database tooling.

Do not create:

VITE_DATABASE_URL=...

14. Frontend Environment Variables

Vite exposes variables to browser code when they use the VITE_ prefix.

Allowed frontend variables:

VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...

Never expose:

VITE_DATABASE_URL=...
VITE_SUPABASE_SERVICE_ROLE_KEY=...

15. .env.example

The repository should contain a safe template:

# Supabase
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Neon PostgreSQL
DATABASE_URL=

# Frontend
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

No actual credentials belong in this file.

16. .gitignore

Recommended:

# Environment files
.env
.env.local
.env.*.local

# Keep the safe template
!.env.example

17. Provider Invitation Flow

The current provider creation architecture is:

Admin Web
    |
    | POST /providers
    v
Node.js API
    |
    ├── Validate provider information
    ├── Check duplicate email
    ├── Check duplicate Work ID
    |
    v
Supabase Auth
    |
    └── inviteUserByEmail()
    |
    v
Invitation Email
    |
    v
Healthcare Provider
    |
    └── Sets own password
    |
    v
Neon PostgreSQL
    |
    └── Provider application profile

The administrator does not create or email a temporary password.

18. Data Separation

Supabase owns authentication identity:

Supabase
├── user ID
├── email
├── authentication state
└── password/authentication credentials

Neon owns PILLPAL application information:

Neon
├── supabaseUserId
├── firstName
├── lastName
├── phone
├── workId
├── specialization
├── role
├── userType
└── status

19. Backend Security Boundary

The Node.js API is the main application security boundary.

Browser
   |
   | Access Token
   v
Node.js API
   |
   ├── Verify Supabase session
   ├── Identify user
   ├── Load PILLPAL user from Neon
   ├── Check role
   ├── Check account status
   └── Perform authorized operation

Frontend guards improve user experience, but backend authorization must
enforce access.

20. Messaging Architecture

PILLPAL does not need a dedicated third-party chat provider.

Recommended:

Patient / Healthcare Web
          |
          v
     Node.js API
          |
          v
        Prisma
          |
          v
    Neon PostgreSQL
          |
          v
   Supabase Realtime

Neon stores application message data.

Supabase Realtime provides real-time update delivery.

The Node.js API remains responsible for authorization.

21. Healthcare Web

Healthcare Web is shared by:

DOCTOR
HEALTH_STAFF

Recommended structure:

apps/healthcare-web/src/
├── components/
│   ├── layout/
│   ├── dashboard/
│   ├── patients/
│   └── common/
│
├── pages/
│   ├── Dashboard/
│   ├── Patients/
│   ├── Appointments/
│   ├── Medications/
│   ├── Adherence/
│   ├── Messages/
│   └── Profile/
│
├── guards/
│   └── HealthcareGuard.tsx
│
├── routes/
│   └── AppRoutes.tsx
│
├── lib/
│   └── api.ts
│
└── types/
    └── healthcare.ts

Doctor and Health Staff use the same portal while backend authorization
determines what each role may perform.

22. Admin Web

Admin Web is responsible for healthcare-provider account administration:

Admin Web
    |
    v
Node.js API
    |
    ├── Create provider
    ├── View providers
    ├── Edit providers
    ├── Activate/deactivate provider
    └── Administrative activity

Admin does not perform clinical operations.

23. Patient Applications

Patients use:

patient-web
patient-mobile

Both follow:

Patient Application
       |
       v
Supabase Auth
       |
       v
Node.js API
       |
       v
Prisma
       |
       v
Neon PostgreSQL

24. Architecture Rules

Rule 1 --- Frontend never connects directly to Neon

Incorrect:

React -> Neon

Correct:

React -> Node API -> Prisma -> Neon

Rule 2 --- Never expose the service-role key

Incorrect:

VITE_SUPABASE_SERVICE_ROLE_KEY=...

Correct:

SUPABASE_SERVICE_ROLE_KEY=...

and use it only server-side.

Rule 3 --- Supabase Auth owns authentication

Do not create a second password/authentication system inside Neon.

Rule 4 --- Neon owns PILLPAL application data

Provider profiles, roles, Work IDs, appointments, medications,
adherence, and messaging data belong to the application database.

Rule 5 --- API authorization is mandatory

Do not rely only on React route protection.

Rule 6 --- Never commit .env

Only commit:

.env.example

25. Target Architecture

                    +---------------------+
                    |     SUPABASE AUTH   |
                    | Identity + Sessions |
                    +----------+----------+
                               |
                               v
+-------------+       +---------------------+
|  Admin Web  |------>|                     |
+-------------+       |                     |
                      |     NODE.JS API     |
+-------------+       |                     |
| Healthcare  |------>| Authentication      |
|    Web      |       | Authorization       |
+-------------+       | Business Logic      |
                      |                     |
+-------------+       +----------+----------+
| Patient Web |------------------+
+-------------+                  |
                                 v
+-------------+            +--------------+
|Patient Mobile|---------->|    Prisma    |
+-------------+            +------+-------+
                                  |
                                  v
                           +--------------+
                           |     NEON     |
                           | PostgreSQL   |
                           +--------------+

                     Supabase Realtime
                            |
                            v
                     Real-time features
                       such as messaging

This document is the baseline architecture for future PILLPAL
development. Any major changes to authentication, database access,
environment variables, or service responsibilities should be deliberate
and documented.