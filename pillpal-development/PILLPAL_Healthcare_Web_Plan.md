# PILLPAL Healthcare Web Plan

## 1. Purpose

The Healthcare Web is the provider portal of PILLPAL for **Doctors** and **Health Staff**. It helps authorized healthcare providers manage patient-related information, medication information, medication adherence, appointments, and communication.

The Healthcare Web is separate from:
- **Management Web** — administrative/provider-account management
- **Patient Web/Mobile** — patient medication and adherence management

## 2. Users

```text
Healthcare Web
├── DOCTOR
└── HEALTH_STAFF
```

Both roles use the same application, with permissions enforced by the backend.

### Doctor
- View patients
- View medication information
- Manage medication-related information
- Monitor adherence
- Communicate with patients
- Provide healthcare support

### Health Staff
- View patients
- View medication information
- Monitor adherence
- Communicate with patients
- Provide healthcare support

## 3. Main Navigation

```text
Healthcare Web
├── Dashboard
├── Patients
├── Appointments
├── Medications
├── Adherence
├── Messages
└── Profile
```

## 4. Dashboard

The dashboard provides a quick overview of healthcare activities:
- Patient overview
- Medication overview
- Adherence overview
- Today's appointments
- Recent messages
- Patients requiring attention

## 5. Patients

```text
Patients
├── Patient List
├── Search
├── Filter
└── Patient Profile
```

Patient profiles may contain:
- Basic information
- Health information
- Medications
- Adherence
- Appointments
- Messages

Only information needed for the provider's healthcare workflow should be displayed.

## 6. Medications

Medication information can include:
- Medication name
- Dosage
- Frequency
- Schedule
- Start date
- End date
- Status

Example:

```text
Amoxicillin
500 mg
3 times daily

8:00 AM
2:00 PM
8:00 PM

Status: Active
```

## 7. Adherence

Providers can monitor whether patients are following their medication schedules.

```text
Adherence
├── Overall Overview
├── Patient Adherence
├── Medication Adherence
└── Follow-up
```

The system can identify patients who may require follow-up based on defined adherence rules.

## 8. Appointments

```text
Appointments
├── Today's Appointments
├── Upcoming
├── Completed
└── Appointment Details
```

Google Calendar integration can be added after the basic appointment workflow is working.

## 9. Messages

PILLPAL messaging uses the Node.js API, Prisma, NeonDB, and Supabase Realtime.

```text
Healthcare Web
      ↓
Node.js API
      ↓
Prisma
      ↓
NeonDB
```

Basic data model:

```text
Conversation
- id
- createdAt
- updatedAt

ConversationParticipant
- id
- conversationId
- userId
- joinedAt

Message
- id
- conversationId
- senderId
- content
- createdAt
- readAt
```

The API must verify that a user is allowed to access a conversation.

## 10. Provider Profile

```text
Profile
├── Personal Information
│   ├── Name
│   ├── Email
│   └── Phone
├── Professional Information
│   ├── Role
│   ├── Work ID
│   └── Specialization
└── Account
    ├── Security
    └── Sign Out
```

Role and Work ID remain controlled by the Management Web.

## 11. Recommended Project Structure

```text
apps/
└── healthcare-web/
    └── src/
        ├── components/
        │   ├── layout/
        │   │   ├── HealthcareLayout.tsx
        │   │   ├── Sidebar.tsx
        │   │   └── Header.tsx
        │   ├── dashboard/
        │   ├── patients/
        │   ├── appointments/
        │   ├── medications/
        │   ├── adherence/
        │   ├── messages/
        │   └── common/
        ├── pages/
        │   ├── Dashboard/
        │   ├── Patients/
        │   ├── Appointments/
        │   ├── Medications/
        │   ├── Adherence/
        │   ├── Messages/
        │   └── Profile/
        ├── guards/
        │   └── HealthcareGuard.tsx
        ├── routes/
        │   └── AppRoutes.tsx
        ├── lib/
        │   └── api.ts
        ├── types/
        │   └── healthcare.ts
        ├── App.tsx
        ├── index.css
        └── main.tsx
```

## 12. Technology Stack

| Area | Technology |
|---|---|
| Frontend | React |
| Build Tool | Vite |
| Language | TypeScript |
| Styling | Tailwind CSS |
| UI | shadcn / Base UI |
| Icons | Lucide React |
| Authentication | Supabase Auth |
| Backend | Node.js |
| API | Native Node.js HTTP |
| ORM | Prisma |
| Database | PostgreSQL / NeonDB |
| Real-time | Supabase Realtime |

## 13. Authentication

```text
Healthcare Web
      ↓
Supabase Auth
      ↓
Authenticated Session
      ↓
Node.js API
      ↓
Check User Role
      ↓
DOCTOR / HEALTH_STAFF
```

Allowed roles are `DOCTOR` and `HEALTH_STAFF`.

```text
ADMIN
  ↓
Management Web

PATIENT
  ↓
Patient Web / Mobile
```

The frontend guard improves the user experience, but the backend must enforce authorization.

## 14. Permission Model

| Function | Doctor | Health Staff |
|---|---:|---:|
| View patients | Yes | Yes |
| View medications | Yes | Yes |
| Monitor adherence | Yes | Yes |
| Patient messaging | Yes | Yes |
| View appointments | Yes | Yes |
| Manage medication information | Yes | Permission-based |
| Provider profile | Yes | Yes |

## 15. API Architecture

The frontend must not connect directly to NeonDB.

```text
Healthcare Web
      │
      │ HTTP
      ▼
 Node.js API
      │
      ├── Supabase Auth
      │
      └── Prisma
            │
            ▼
          NeonDB
```

Supabase Realtime can be used where real-time updates are needed.

## 16. Development Phases

### Phase 1 — Foundation
- Clean the Vite starter
- Create the folder structure
- Configure React Router
- Configure styling
- Remove unused starter files

### Phase 2 — Authentication
- Healthcare login
- Supabase session handling
- HealthcareGuard
- Doctor/Health Staff role verification

### Phase 3 — Layout
- Sidebar
- Header
- Navigation
- Provider menu
- Logout

### Phase 4 — Dashboard
- Patient overview
- Medication overview
- Adherence overview
- Appointments
- Attention indicators

### Phase 5 — Patients
- Patient list
- Search
- Filter
- Patient profile
- Patient details

### Phase 6 — Medications
- Medication list
- Medication details
- Medication management
- Medication schedules

### Phase 7 — Adherence
- Adherence overview
- Patient adherence
- Medication adherence
- Adherence history
- Attention indicators

### Phase 8 — Appointments
- Appointment list
- Appointment details
- Basic appointment management

### Phase 9 — Messaging
- Conversations
- Messages
- Read status
- Supabase Realtime

### Phase 10 — Profile
- Provider profile
- Account settings
- Security
- Logout

### Phase 11 — API Integration
Connect the Healthcare Web to the Node.js API and database.

### Phase 12 — Testing
Test authentication, role restrictions, patient access, medication access, adherence, messaging permissions, API validation, error handling, and responsive design.

## 17. Overall PILLPAL Architecture

```text
                         PILLPAL
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
    Management Web    Healthcare Web    Patient Web/Mobile
          │                 │                 │
        ADMIN         DOCTOR / STAFF       PATIENT
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                            ▼
                       Node.js API
                            │
                ┌───────────┴───────────┐
                │                       │
          Supabase Auth             Prisma ORM
                                        │
                                        ▼
                                     NeonDB
```

| Portal | Main Responsibility |
|---|---|
| Management Web | Manage healthcare-provider accounts |
| Healthcare Web | Healthcare provider operations |
| Patient Web/Mobile | Patient medication and adherence management |

## 18. First Implementation Step

Start the Healthcare Web in this order:

1. Clean the default Vite starter.
2. Create the recommended folder structure.
3. Configure React Router.
4. Remove unused starter files.
5. Verify that the application runs.
6. Add the Healthcare authentication guard.
7. Build the Healthcare layout.
8. Build the dashboard.
9. Connect pages to the Node.js API.

Complete and verify the foundation before implementing the dashboard or other major features.
