PILLPAL Management Web Plan
1. Main Purpose
The Management Web is the administrative control center of PILLPAL.
> Management Web allows authorized administrators to manage healthcare-provider accounts, monitor system activity, and maintain administrative control over the PILLPAL platform.
The Management Web focuses on administrative functions. Clinical activities such as prescribing medication, monitoring individual patient adherence, and patient-provider communication belong to the Healthcare Web.
---
2. Management Web Structure
```text
Management Web
│
├── Dashboard
├── Healthcare Providers
│   ├── All Providers
│   ├── Doctors
│   └── Health Staff
├── Activity Log
├── Notifications
├── Settings
└── Admin Profile
```
---
3. Dashboard
The dashboard provides administrators with a quick overview of the platform.
Dashboard Information
Total healthcare providers
Total Doctors
Total Health Staff
Active providers
Inactive providers
Recently created provider accounts
Recent administrative activity
---
4. Healthcare Providers
Healthcare Provider Management is the main function of the Management Web.
Administrators can:
Search providers
Filter providers
View provider information
Edit provider information
Activate provider accounts
Deactivate provider accounts
Provider Information
Information	Doctor	Health Staff
First Name	Required	Required
Last Name	Required	Required
Email	Required	Required
Phone	Optional	Optional
Work ID	Required	Required
Specialization	Required	Not applicable
Status	Required	Required
---
5. Create / Invite Provider
The Management Web uses the provider invitation system.
Administrators do not create passwords for providers. Instead, the provider receives an invitation and creates their own password.
```text
Admin
  ↓
Invite Provider
  ↓
Enter Provider Information
  ↓
Management API
  ↓
Supabase Invitation
  ↓
Provider Receives Email
  ↓
Provider Sets Password
  ↓
Provider Logs In
  ↓
Healthcare Web
```
---
6. Provider Profile
Administrators can view and manage provider information.
```text
Provider Details
│
├── Personal Information
│   ├── Name
│   ├── Email
│   └── Phone
│
├── Work Information
│   ├── Work ID
│   ├── Role
│   └── Specialization
│
├── Account Information
│   ├── Status
│   ├── Created Date
│   └── Updated Date
│
└── Actions
    ├── Edit
    ├── Activate
    └── Deactivate
```
---
7. Account Status Management
Administrators can control whether a healthcare provider can access the system.
```text
ACTIVE
   ↓
Provider can access Healthcare Web

INACTIVE
   ↓
Provider access is restricted
```
Deactivating an account should not delete the provider's existing records. The account status is changed to `INACTIVE`.
---
8. Activity Log
The Management Web records important administrative actions.
Possible activities include:
Provider invited
Provider information updated
Provider activated
Provider deactivated
Admin login
Administrative settings changed
Example:
```text
Activity Log

Admin invited a Doctor
September 30, 2026

Admin updated a Health Staff account
September 30, 2026

Admin deactivated a provider
September 29, 2026
```
---
9. Notifications
The administrator can view important administrative notifications.
Examples:
New provider invitation sent
Provider account activated
Provider account deactivated
Administrative activity requiring attention
The first version can keep notifications simple.
---
10. Settings
Management settings can contain:
```text
Settings
│
├── Account
├── Security
└── System Preferences
```
Only necessary settings should be implemented initially.
---
11. Admin Profile
Administrators can view their own account information.
```text
Admin Profile

Name
Email
Role: ADMIN

[Edit Profile]
[Change Password]
[Sign Out]
```
Authentication is handled through Supabase Auth.
---
12. Recommended Project Structure
```text
apps/
└── management-web/
    └── src/
        ├── components/
        │   ├── layout/
        │   │   ├── ManagementLayout.tsx
        │   │   ├── Sidebar.tsx
        │   │   └── Header.tsx
        │   │
        │   ├── dashboard/
        │   ├── providers/
        │   └── common/
        │
        ├── pages/
        │   ├── Dashboard/
        │   ├── Providers/
        │   ├── ActivityLog/
        │   ├── Notifications/
        │   ├── Settings/
        │   └── Profile/
        │
        ├── guards/
        │   └── ManagementGuard.tsx
        │
        ├── routes/
        │   └── AppRoutes.tsx
        │
        ├── lib/
        │   └── api.ts
        │
        ├── types/
        │   └── management.ts
        │
        ├── App.tsx
        ├── index.css
        └── main.tsx
```
---
13. Technology Stack
Part	Technology
Frontend	React
Build Tool	Vite
Language	TypeScript
Styling	Tailwind CSS
UI	shadcn / Base UI
Icons	Lucide React
Authentication	Supabase Auth
Backend	Node.js
Database ORM	Prisma
Database	PostgreSQL / NeonDB
API	Native Node.js HTTP
---
14. Management Web and API
The Management Web should never connect directly to NeonDB.
```text
Management Web
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
The API should verify:
The administrator is authenticated.
The user has the `ADMIN` role.
The administrator is authorized to perform the requested action.
---
15. Portal Responsibilities
Function	Management Web	Healthcare Web	Patient Web
Manage provider accounts	✅	❌	❌
Invite Doctor	✅	❌	❌
Invite Health Staff	✅	❌	❌
Activate/deactivate providers	✅	❌	❌
Manage patients	❌	✅	Own data
Manage medications	❌	✅	Own medications
Monitor adherence	❌	✅	Own adherence
Patient-provider messaging	❌	✅	✅
Medication reminders	❌	❌	✅
---
16. Development Phases & Current Status

### Phase 1 — Foundation `[COMPLETED]`
- [x] Create Management Web (`apps/admin-web`)
- [x] Clean the Vite starter
- [x] Install/configure routing (`react-router-dom`)
- [x] Configure shared styling (Tailwind CSS v4 & typography)
- [x] Create the basic project structure (`components/`, `pages/`, `routes/`, `lib/`)

### Phase 2 — Authentication `[COMPLETED]`
- [x] Management login (`Login.tsx`)
- [x] Supabase session handling (`@pillpal/auth`)
- [x] `AdminGuard` / `ManagementGuard` route protection
- [x] Verify `ADMIN` role via backend `/me` endpoint
- [x] First-time setup wizard (`AdminSetup.tsx` & `/setup/admin`)

### Phase 3 — Layout `[COMPLETED]`
- [x] Sidebar navigation (`Sidebar.tsx`)
- [x] Header bar (`Header.tsx`)
- [x] Routing layout structure (`AdminLayout.tsx` & `AppRoutes.tsx`)
- [x] Admin profile badge & Logout workflow

### Phase 4 — Dashboard `[COMPLETED]`
- [x] Provider statistics (Total Providers, Active Doctors, Active Staff)
- [x] Active/inactive account metrics
- [x] Summary metrics & quick action buttons (`Dashboard.tsx`)

### Phase 5 — Provider Management `[COMPLETED]`
- [x] All Providers listing (`Providers.tsx`)
- [x] Doctors filter tab
- [x] Health Staff filter tab
- [x] Live search (by name, email, work ID, specialization)
- [x] Status filter (All, Active, Inactive)
- [x] View provider modal/details
- [x] Edit provider information modal & API update (`PUT /providers/:id`)

### Phase 6 — Provider Invitations `[COMPLETED]`
- [x] Invite Doctor dialog (`CreateProviderDialog.tsx`)
- [x] Invite Health Staff dialog
- [x] Supabase email invitation flow (`inviteUserByEmail`)
- [x] Database record creation linked to Supabase User ID (`POST /providers`)

### Phase 7 — Account Control `[COMPLETED]`
- [x] Activate provider account
- [x] Deactivate provider account (status toggling via `PATCH /providers/:id/status`)
- [x] Backend authorization guards verifying `ADMIN` role

### Phase 8 — Activity and Notifications `[COMPLETED]`
- [x] Activity log database schema (`ActivityLog` model) & NeonDB synchronization
- [x] Activity log API service & endpoints (`GET /activity-logs`)
- [x] Automated action logging on provider invite, status change, profile update, and admin setup
- [x] Activity log UI page (`ActivityLog.tsx`) with search, action filtering, and timestamps
- [x] Administrative notifications database schema (`AdminNotification` model)
- [x] Notifications API endpoints (`GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`)
- [x] Notifications UI page (`Notifications.tsx`) with unread counters, type indicators, and batch read actions

### Phase 9 — Final Integration & Polish `[COMPLETED]`
- [x] Connect Management Web pages to the Node.js API
- [x] Test permissions & Supabase authentication
- [x] Test Prisma/NeonDB operations
- [x] Centralize API URL (`import.meta.env.VITE_API_URL` with helper `fetchWithAuth`)
- [x] Implement live Administrative Dashboard (`Dashboard.tsx`) with real KPI metrics and live activity feed
- [x] Implement System Settings page (`Settings.tsx`) with backend health diagnostics
- [x] Implement Administrator Profile page (`Profile.tsx`) with session management & sign out
- [x] Complete navigation and routing across the entire Management Web portal (`AppRoutes.tsx`, `Sidebar.tsx`, `Header.tsx`)
- [x] Static persistent sidebar with independent page scrolling layout shell (`AdminLayout.tsx`, `Sidebar.tsx`)
- [x] Modern UI redesign inspired by clean SaaS clinical portal: pill navigation, blue circle avatar, 4-card metric grid, and overview containers (`Sidebar.tsx`, `Header.tsx`, `Dashboard.tsx`)
- [x] Modern shadcn sidebar with desktop collapse toggle button, shortcut `Ctrl+B`, and smooth transition (`Sidebar.tsx`)
- [x] Adaptive floating navbar dock (`FloatingNav.tsx`) active on mobile and automatically displayed on desktop when sidebar is collapsed
- [x] Modern interactive header (`Header.tsx`) with collapse toggle, interactive breadcrumbs, live alert badge, and profile menu
- [x] Comprehensive skeleton loading states across Dashboard, Providers, Activity Log, Notifications, and Profile (`Skeleton.tsx`)
- [x] Fully responsive layout with mobile cards view for healthcare directory and safe scroll padding (`AdminLayout.tsx`, `Providers.tsx`)
- [x] Fix monorepo build pipeline (`turbo.json` outputs & asset resolution)
---
17. PILLPAL Portal Architecture
```text
                         PILLPAL
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              ▼
       Management      Healthcare       Patient
           Web             Web             Web
             │              │              │
           ADMIN          DOCTOR         PATIENT
                          HEALTH
                           STAFF
```
Management Web
Purpose: Manage the PILLPAL system and healthcare-provider accounts.
Healthcare Web
Purpose: Allow Doctors and Health Staff to work with patients and support medication adherence.
Patient Web / Mobile
Purpose: Allow patients to manage and track their own medications and adherence.
---
18. Development Principle
Keep each portal focused on its own responsibility.
```text
Management Web
      ↓
Administrative Management

Healthcare Web
      ↓
Healthcare Provider Operations

Patient Web / Mobile
      ↓
Patient Medication Management
```
This separation keeps the PILLPAL architecture organized, maintainable, and easier for the development team to understand.