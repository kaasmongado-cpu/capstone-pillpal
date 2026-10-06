# PILLPAL Medication Inventory Plan

## 1. Executive Purpose

The **Medication Inventory Module** manages the physical pharmaceutical stock of the CSU University Health Services Clinic.

The core principle is:
> **Health Staff** manage medication inventory, bulk supply shipments, batch expirations, stock levels, and clinic dispensing.
> **Doctors** manage patient diagnoses, clinical regimens, and individual patient prescriptions (with live read-only visibility into clinic stock levels).

---

## 2. Core Separation of Responsibilities

There are two distinct pharmaceutical concepts in PILLPAL:

```text
┌────────────────────────────────────────────────────────┐
│               1. CLINIC MEDICATION INVENTORY           │
│  Managed by: HEALTH STAFF                              │
│  Scope: Bulk stock on clinic shelves & storage         │
│  Answers: "How many tablets/bottles do we have left?"  │
│  Operations: Receive shipments, Lot/Expiry tracking,   │
│              Dispense, Physical stock count audit      │
└───────────────────────────┬────────────────────────────┘
                            │ (Informs availability)
                            ▼
┌────────────────────────────────────────────────────────┐
│              2. PATIENT CLINICAL PRESCRIPTIONS         │
│  Managed by: DOCTORS                                   │
│  Scope: Personalized patient medical treatment plan    │
│  Answers: "What dose and schedule does patient take?"  │
│  Operations: Issue Rx, Set dose & frequency, Monitor   │
│              adherence & treatment efficacy            │
└────────────────────────────────────────────────────────┘
```

---

## 3. Inventory Lifecycle & Workflows

```text
PHARMACEUTICAL SUPPLIER / DOH ALLOTMENT
                │
                ▼
        HEALTH STAFF INTAKE
  (Record Lot #, Expiry Date, Qty, Supplier)
                │
                ▼
       CLINIC INVENTORY DATABASE
  (Tracks Active Batches via FEFO Rule)
                │
  ┌─────────────┴──────────────┐
  ▼                            ▼
PRESCRIPTION DISPENSING    WALK-IN / OTC DISPENSING
(Linked to Doctor Rx       (Triage headache, fever,
 & Patient Profile)         first-aid emergency)
  │                            │
  └─────────────┬──────────────┘
                ▼
      ATOMIC STOCK DEDUCTION
 (Generates Immutable Audit Ledger)
                │
                ▼
  REAL-TIME THRESHOLD MONITORING
 (AVAILABLE / LOW STOCK / EXPIRING SOON / OUT OF STOCK)
```

---

## 4. Medication Stock & Expiry Rules

### 4.1 Stock Level Status Logic
- **`AVAILABLE`**: `Current Stock > Minimum Stock Level`
- **`LOW_STOCK`**: `0 < Current Stock <= Minimum Stock Level` (Triggers alert banner)
- **`OUT_OF_STOCK`**: `Current Stock == 0` (Flagged in Doctor prescribing view)

### 4.2 Expiration & FEFO (First-Expired, First-Out)
- **`EXPIRING_SOON`**: Medications with active batches expiring within **60 days**.
- **`EXPIRED`**: Medication past expiration date — automatically locked from dispensing and flagged for disposal/quarantine.
- **FEFO Principle**: When dispensing, the system automatically suggests or deducts from the batch with the earliest valid expiration date.

---

## 5. Dispensing Modes

Health Staff can record medication departure through two clear clinical pathways:

### Pathway A: Prescription-Linked Dispensing (Closed-Loop)
1. Patient presents their student/employee ID at the clinic pharmacy window.
2. Health Staff searches patient $\rightarrow$ sees active doctor prescriptions.
3. Health Staff clicks **"Dispense Prescription"** $\rightarrow$ verifies dosage $\rightarrow$ confirms quantity.
4. **System Action**:
   - Deducts inventory stock.
   - Creates an `InventoryTransaction` linked to `patientId`, `prescriptionId`, and `performedById`.
   - Records dispensation in the patient's medical timeline.

### Pathway B: Direct Clinic / OTC Walk-in Dispensing
1. Student or faculty visits the clinic with an acute minor symptom (e.g., headache, fever, hyperacidity).
2. Health Staff provides immediate relief (e.g., 2 tablets of Paracetamol 500mg, Antacid).
3. Health Staff selects medication $\rightarrow$ enters quantity dispensed $\rightarrow$ chooses reason (`"Walk-in OTC Care"`).
4. **System Action**:
   - Deducts inventory stock.
   - Logs an `InventoryTransaction` under `DISPENSED_OTC`.

---

## 6. Physical Audit & Stock Discrepancy Reconciliation

During periodic physical inventory counts:
- If shelf count differs from system count (due to damaged ampoules, spills, or data entry corrections):
- Health Staff uses **"Audit Stock Adjustment"**.
- Enters physical count + mandatory clinical note (e.g., *"Bottle dropped and broken during triage"*, *"Physical inventory count reconciliation"*).
- Generates an `ADJUSTED_AUDIT` transaction ledger entry.

---

## 7. Recommended Database Schema (Prisma ORM)

```prisma
enum InventoryStatus {
  AVAILABLE
  LOW_STOCK
  OUT_OF_STOCK
  EXPIRED
}

enum InventoryTransactionType {
  RECEIVED          // New shipment/lot received into clinic
  DISPENSED_RX      // Dispensed against a Doctor's prescription
  DISPENSED_OTC     // Dispensed for walk-in/first-aid care
  ADJUSTED_AUDIT    // Corrected during physical count audit
  DAMAGED_EXPIRED   // Disposed due to expiration or damage
  RETURNED          // Returned to inventory
}

model InventoryItem {
  id              String          @id @default(cuid())
  name            String          // Generic Name (e.g., "Amoxicillin")
  brandName       String?         // Brand Name if applicable (e.g., "Amoxil")
  strength        String          // e.g. "500 mg", "100 mcg", "10 mg"
  form            String          // Tablet, Capsule, Syrup, Inhaler, Vial
  category        String          // Antibiotics, Analgesics, Antihypertensives, Respiratory, etc.
  
  currentStock    Int             @default(0)
  minimumStock    Int             @default(20)
  status          InventoryStatus @default(AVAILABLE)

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  batches         InventoryBatch[]
  transactions    InventoryTransaction[]
}

model InventoryBatch {
  id              String        @id @default(cuid())
  inventoryItemId String
  batchNumber     String        // e.g. "LOT-2026-09A"
  quantity        Int           // Units in this specific lot
  expiryDate      DateTime
  receivedDate    DateTime      @default(now())
  supplier        String?       // e.g. "DOH Regional Depot", "Mercury Drug Bulk"

  inventoryItem   InventoryItem @relation(fields: [inventoryItemId], references: [id], onDelete: Cascade)
}

model InventoryTransaction {
  id              String                   @id @default(cuid())
  inventoryItemId String
  type            InventoryTransactionType
  quantity        Int                      // Positive for added stock, negative for dispensed/disposed
  previousStock   Int
  newStock        Int
  
  performedById   String                   // Health Staff User ID
  patientId       String?                  // Optional: Linked Patient Profile ID
  prescriptionId  String?                  // Optional: Linked Prescription ID
  batchNumber     String?                  // Specific lot if tracked
  reason          String?                  // e.g. "Prescription refill for Maria Santos", "Monthly inventory recount"
  
  createdAt       DateTime                 @default(now())

  inventoryItem   InventoryItem            @relation(fields: [inventoryItemId], references: [id], onDelete: Cascade)
  performedBy     User                     @relation(fields: [performedById], references: [id])
}
```

---

## 8. API Endpoints Specification

Base Route: `/inventory`

| Method | Endpoint | Description | Access Role |
| :--- | :--- | :--- | :--- |
| `GET` | `/inventory` | List all inventory items with stock levels, category, and status | `HEALTH_STAFF`, `DOCTOR`, `ADMIN` |
| `GET` | `/inventory/:id` | Get single inventory item with active batches & recent history | `HEALTH_STAFF`, `DOCTOR`, `ADMIN` |
| `POST` | `/inventory` | Create a new medication catalog entry | `HEALTH_STAFF`, `ADMIN` |
| `POST` | `/inventory/:id/receive` | Receive a new supply batch (Lot #, Expiry, Qty, Supplier) | `HEALTH_STAFF`, `ADMIN` |
| `POST` | `/inventory/:id/dispense` | Dispense stock (Rx or OTC walk-in) with automatic deduction | `HEALTH_STAFF`, `ADMIN` |
| `POST` | `/inventory/:id/adjust` | Physical count audit adjustment with required reason note | `HEALTH_STAFF`, `ADMIN` |
| `GET` | `/inventory/history` | Chronological ledger of all inventory transactions | `HEALTH_STAFF`, `ADMIN` |
| `GET` | `/inventory/alerts` | Summary of low-stock and expiring-soon medications | `HEALTH_STAFF`, `DOCTOR`, `ADMIN` |

---

## 9. Role-Based Access Control (RBAC) Matrix

| Feature / Action | Health Staff 👩‍⚕️ | Doctor 👨‍⚕️ | Admin 🛡️ | Patient 📱 |
| :--- | :---: | :---: | :---: | :---: |
| **View Medication Inventory** | ✅ Full Access | ✅ Read-Only (Availability) | ✅ Full Access | ❌ No Access |
| **Add New Inventory Item** | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| **Receive Supply & Log Batches** | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| **Dispense Medication** | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| **Audit Stock Corrections** | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| **View Transaction History** | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| **Issue Clinical Prescriptions** | ❌ (Doctor only) | ✅ Yes | ✅ Yes | ❌ No |

---

## 10. Healthcare Web UI Layout (`apps/healthcare-web`)

### Main Navigation Structure
```text
Healthcare Web
├── Dashboard (Tailored for Doctor vs. Health Staff)
├── Patients (CSU Directory & Profile Views)
├── Prescriptions & Regimens (Doctor Prescribing Workspace + Live Clinic Stock Badges)
├── Medication Inventory (Health Staff Primary Workspace)
│    ├── Stock Overview Table (Search, Form/Category Filter, Status Chips)
│    ├── Receive Supply Modal (Medication, Lot Number, Expiration Date, Quantity, Supplier)
│    ├── Dispense Modal (Patient lookup / OTC walk-in, Quantity, Notes)
│    ├── Low Stock & Expiry Alerts Tab
│    └── Inventory Transaction Ledger Tab
├── Adherence Monitoring (Real-time dose ingestion stream)
├── Appointments (Consultation schedules)
└── Messages (Secure patient communications)
```

### Health Staff Inventory Dashboard Widgets
```text
┌───────────────────────────┐  ┌───────────────────────────┐  ┌───────────────────────────┐
│     Total Medications     │  │      Low Stock Alert      │  │     Expiring in 60d       │
│        42 Items           │  │       3 Requiring Order   │  │       2 Batches           │
└───────────────────────────┘  └───────────────────────────┘  └───────────────────────────┘
```

---

## 11. Implementation Status & Roadmap

- [x] **Phase 1: Prisma Schema & DB Push** (Completed)
  - Added `InventoryItem`, `InventoryBatch`, and `InventoryTransaction` models to `packages/database/prisma/schema.prisma`.
  - Pushed to Neon PostgreSQL DB via `prisma db push` and regenerated the Prisma Client.
- [x] **Phase 2: Backend API Implementation** (Completed)
  - Created `apps/api/src/routes/inventory.ts` with atomic `$transaction` stock queries, FEFO batch deduction, and transaction logging.
  - Wired `/inventory` endpoints into `apps/api/src/server.ts`.
- [x] **Phase 3: Inventory Seeding** (Completed)
  - Created `apps/api/src/scripts/seed-inventory.ts` and seeded standard clinic pharmaceuticals (Amoxicillin, Metformin, Amlodipine, Paracetamol, Salbutamol Inhaler, Cetirizine, Oral Rehydration Salts, Ibuprofen).
- [x] **Phase 4: Healthcare Web Inventory Workspace** (Completed)
  - Created `apps/healthcare-web/src/pages/Inventory/Inventory.tsx` with *Stock Catalog*, *Alerts & Expiry*, and *Transaction Ledger* tabs.
  - Built modals for *New Catalog Item*, *Receive Supply*, *Dispense Stock*, and *Audit Stock Adjustment*.
  - Added "Inventory" navigation links in `Sidebar.tsx` and `FloatingNav.tsx`.
- [x] **Phase 5: Prescribing Integration** (Completed)
  - Connected clinic stock selector in `Medications.tsx` so Doctors can view available stock when issuing prescriptions.
- [x] **Phase 6: Verification & Testing** (Completed)
  - `npm run check-types`: 0 TypeScript errors across monorepo.
  - `npm test`: 11/11 unit tests passed.
  - `npm run build`: Production build verified for all apps.