import * as SQLite from "expo-sqlite";

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync("pillpal_patient.db");
  }
  return dbInstance;
}

export async function initDatabase(): Promise<void> {
  const db = await getDb();

  // Create tables for true offline-first functionality
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    -- 1. Cached User Profile & Campus Health ID
    CREATE TABLE IF NOT EXISTS local_user_profile (
      id TEXT PRIMARY KEY,
      id_number TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      department TEXT NOT NULL,
      blood_type TEXT,
      allergies TEXT,
      medical_conditions TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      last_synced_at INTEGER NOT NULL
    );

    -- 2. Local Prescriptions
    CREATE TABLE IF NOT EXISTS local_prescriptions (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      doctor_id TEXT,
      doctor_name TEXT,
      name TEXT NOT NULL,
      dosage TEXT NOT NULL,
      form TEXT,
      instructions TEXT,
      frequency TEXT NOT NULL,
      schedule_times TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      is_local_draft INTEGER DEFAULT 0,
      image_uri TEXT,
      last_synced_at INTEGER NOT NULL
    );

    -- 3. Local Adherence Logs
    CREATE TABLE IF NOT EXISTS local_adherence_logs (
      id TEXT PRIMARY KEY,
      prescription_id TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      taken_time TEXT,
      status TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'PENDING'
    );

    -- 4. Transactional Outbox Sync Queue
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      http_method TEXT NOT NULL,
      payload TEXT NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL,
      retry_count INTEGER DEFAULT 0,
      last_error TEXT
    );

    -- 5. Cached Appointments (Offline-first consultation view)
    CREATE TABLE IF NOT EXISTS local_appointments (
      id TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      provider_name TEXT,
      provider_specialization TEXT,
      telehealth_url TEXT,
      clinical_notes TEXT,
      checked_in_at TEXT,
      last_synced_at INTEGER NOT NULL
    );

    -- 6. Generic Offline JSON Cache (Conversations & Messages)
    CREATE TABLE IF NOT EXISTS local_kv_cache (
      cache_key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Safe migrations for existing databases
  try {
    await db.execAsync("ALTER TABLE local_prescriptions ADD COLUMN image_uri TEXT;");
  } catch {
    // Column already exists
  }
  try {
    await db.execAsync("ALTER TABLE local_appointments ADD COLUMN rejection_reason TEXT;");
  } catch {
    // Column already exists
  }
  try {
    await db.execAsync("ALTER TABLE local_appointments ADD COLUMN cancellation_reason TEXT;");
  } catch {
    // Column already exists
  }
}

// ----------------------------------------------------
// Prescriptions Helpers
// ----------------------------------------------------

export interface LocalPrescription {
  id: string;
  patient_id: string;
  doctor_id?: string | null;
  doctor_name?: string | null;
  name: string;
  dosage: string;
  form?: string | null;
  instructions?: string | null;
  frequency: string;
  schedule_times: string[]; // parsed from JSON string
  start_date: string;
  end_date?: string | null;
  status: string;
  is_local_draft?: number;
  image_uri?: string | null;
}

export async function getLocalPrescriptions(): Promise<LocalPrescription[]> {
  const db = await getDb();
  try {
    await db.runAsync("DELETE FROM local_prescriptions WHERE id = 'rx_demo_1' OR id LIKE 'rx_demo%'");
  } catch {
    // ignore
  }
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM local_prescriptions WHERE status = 'ACTIVE' ORDER BY start_date DESC"
  );
  return rows.map((r) => ({
    ...r,
    schedule_times: JSON.parse(r.schedule_times || "[]"),
  }));
}

export async function getAllLocalPrescriptions(): Promise<LocalPrescription[]> {
  const db = await getDb();
  try {
    await db.runAsync("DELETE FROM local_prescriptions WHERE id = 'rx_demo_1' OR id LIKE 'rx_demo%'");
  } catch {
    // ignore
  }
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM local_prescriptions ORDER BY start_date DESC"
  );
  return rows.map((r) => ({
    ...r,
    schedule_times: JSON.parse(r.schedule_times || "[]"),
  }));
}

export async function deleteLocalPrescription(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM local_prescriptions WHERE id = ?", [id]);
  await db.runAsync("DELETE FROM local_adherence_logs WHERE prescription_id = ?", [id]);
}

export async function clearAllLocalPrescriptions(): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM local_prescriptions");
  await db.runAsync("DELETE FROM local_adherence_logs");
}

export async function reconcileServerPrescriptions(serverRxs: any[]): Promise<void> {
  const serverIds = new Set(serverRxs.map((r) => r.id));

  // 1. Upsert each server prescription (including ACTIVE, PAUSED, COMPLETED, DISCONTINUED) into local SQLite
  for (const rx of serverRxs) {
    await saveLocalPrescription({
      id: rx.id,
      patient_id: rx.patientId,
      doctor_id: rx.doctorId ?? null,
      doctor_name: rx.prescribedBy || (rx.doctor ? `${rx.doctor.firstName} ${rx.doctor.lastName}` : "CSU Clinic"),
      name: rx.name,
      dosage: rx.dosage,
      form: rx.form || "Capsule",
      instructions: rx.instructions || null,
      frequency: rx.frequency,
      schedule_times: rx.scheduleTimes || [],
      start_date: rx.startDate,
      end_date: rx.endDate ?? null,
      status: rx.status || "ACTIVE",
      is_local_draft: 0,
    });
  }

  // 2. Remove any local prescriptions (that are not unsynced offline drafts) that no longer exist on server
  const localList = await getAllLocalPrescriptions();
  for (const local of localList) {
    if (local.is_local_draft !== 1 && !serverIds.has(local.id)) {
      await deleteLocalPrescription(local.id);
    }
  }
}

export async function saveLocalPrescription(
  rx: Omit<LocalPrescription, "schedule_times"> & { schedule_times: string[] }
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO local_prescriptions (
      id, patient_id, doctor_id, doctor_name, name, dosage, form,
      instructions, frequency, schedule_times, start_date, end_date, status, is_local_draft, image_uri, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rx.id,
      rx.patient_id,
      rx.doctor_id ?? null,
      rx.doctor_name ?? null,
      rx.name,
      rx.dosage,
      rx.form ?? null,
      rx.instructions ?? null,
      rx.frequency,
      JSON.stringify(rx.schedule_times),
      rx.start_date,
      rx.end_date ?? null,
      rx.status,
      rx.is_local_draft ?? 0,
      rx.image_uri ?? null,
      Date.now(),
    ]
  );

  // If this prescription was created locally via mobile OCR, enqueue for server sync
  if (rx.is_local_draft === 1) {
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_outbox (
        id, endpoint, http_method, payload, idempotency_key, created_at, retry_count
      ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [
        `outbox_${rx.id}`,
        "/medications/patient-regimen",
        "POST",
        JSON.stringify({
          id: rx.id,
          name: rx.name,
          dosage: rx.dosage,
          form: rx.form,
          instructions: rx.instructions,
          frequency: rx.frequency,
          scheduleTimes: rx.schedule_times,
          startDate: rx.start_date,
          endDate: rx.end_date ?? null,
        }),
        `prescription_${rx.id}`,
        Date.now(),
      ]
    );
  }
}

// ----------------------------------------------------
// Adherence Log Helpers (1-Tap Intake Offline)
// ----------------------------------------------------

export interface LocalAdherenceLog {
  id: string;
  prescription_id: string;
  scheduled_time: string;
  taken_time?: string | null;
  status: "TAKEN" | "SKIPPED" | "MISSED";
  notes?: string | null;
  created_at: string;
  sync_status: "PENDING" | "SYNCED" | "FAILED";
}

export async function logDoseLocally(
  log: Omit<LocalAdherenceLog, "sync_status">,
  options: { enqueueOutbox?: boolean } = { enqueueOutbox: true },
): Promise<void> {
  const shouldEnqueue = options.enqueueOutbox !== false;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // 1. Upsert into local log (prevents primary key collisions)
    await db.runAsync(
      `INSERT OR REPLACE INTO local_adherence_logs (
        id, prescription_id, scheduled_time, taken_time, status, notes, created_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        log.id,
        log.prescription_id,
        log.scheduled_time,
        log.taken_time ?? null,
        log.status,
        log.notes ?? null,
        log.created_at,
        shouldEnqueue ? "PENDING" : "SYNCED",
      ]
    );

    // 2. Optionally queue into sync_outbox for offline background flush
    if (shouldEnqueue) {
      await db.runAsync(
        `INSERT OR REPLACE INTO sync_outbox (
          id, endpoint, http_method, payload, idempotency_key, created_at, retry_count
        ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [
          log.id,
          "/adherence",
          "POST",
          JSON.stringify({
            prescriptionId: log.prescription_id,
            scheduledTime: log.scheduled_time,
            takenTime: log.taken_time ?? null,
            status: log.status,
            notes: log.notes ?? null,
          }),
          `adherence_${log.id}`,
          Date.now(),
        ]
      );
    }
  });
}

export async function upsertSyncedServerLog(
  log: Omit<LocalAdherenceLog, "sync_status">,
): Promise<void> {
  await logDoseLocally(log, { enqueueOutbox: false });
}

export async function getTodayLocalLogs(): Promise<LocalAdherenceLog[]> {
  const db = await getDb();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return db.getAllAsync<LocalAdherenceLog>(
    "SELECT * FROM local_adherence_logs WHERE created_at >= ? ORDER BY created_at DESC",
    [startOfDay.toISOString()]
  );
}

// ----------------------------------------------------
// Sync Outbox Queue
// ----------------------------------------------------

export interface OutboxItem {
  id: string;
  endpoint: string;
  http_method: string;
  payload: string;
  idempotency_key: string;
  created_at: number;
  retry_count: number;
  last_error?: string | null;
}

export async function getPendingOutbox(): Promise<OutboxItem[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxItem>(
    "SELECT * FROM sync_outbox ORDER BY created_at ASC LIMIT 50"
  );
}

export async function dequeueOutbox(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM sync_outbox WHERE id = ?", [id]);
}

export async function markLogSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE local_adherence_logs SET sync_status = 'SYNCED' WHERE id = ?",
    [id]
  );
}

export async function enqueueOutboxAction(item: {
  id: string;
  endpoint: string;
  http_method: "POST" | "PATCH" | "PUT";
  payload: unknown;
  idempotency_key: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_outbox (
      id, endpoint, http_method, payload, idempotency_key, created_at, retry_count
    ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [
      item.id,
      item.endpoint,
      item.http_method,
      JSON.stringify(item.payload),
      item.idempotency_key,
      Date.now(),
    ]
  );
}

// ----------------------------------------------------
// Appointments Cache Helpers
// ----------------------------------------------------

export interface LocalAppointment {
  id: string;
  reason: string;
  type: "IN_PERSON" | "TELEHEALTH" | string;
  status: string;
  scheduledAt: string;
  providerName?: string | null;
  providerSpecialization?: string | null;
  telehealthUrl?: string | null;
  clinicalNotes?: string | null;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  checkedInAt?: string | null;
}

export async function getLocalAppointments(): Promise<LocalAppointment[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM local_appointments ORDER BY scheduled_at DESC"
  );
  return rows.map((r) => ({
    id: r.id,
    reason: r.reason,
    type: r.type,
    status: r.status,
    scheduledAt: r.scheduled_at,
    providerName: r.provider_name,
    providerSpecialization: r.provider_specialization,
    telehealthUrl: r.telehealth_url,
    clinicalNotes: r.clinical_notes,
    rejectionReason: r.rejection_reason ?? null,
    cancellationReason: r.cancellation_reason ?? null,
    checkedInAt: r.checked_in_at,
  }));
}

export async function saveLocalAppointments(appointments: LocalAppointment[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const appt of appointments) {
      await db.runAsync(
        `INSERT OR REPLACE INTO local_appointments (
          id, reason, type, status, scheduled_at, provider_name,
          provider_specialization, telehealth_url, clinical_notes, rejection_reason, cancellation_reason, checked_in_at, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          appt.id,
          appt.reason,
          appt.type,
          appt.status,
          appt.scheduledAt,
          appt.providerName ?? null,
          appt.providerSpecialization ?? null,
          appt.telehealthUrl ?? null,
          appt.clinicalNotes ?? null,
          appt.rejectionReason ?? null,
          appt.cancellationReason ?? null,
          appt.checkedInAt ?? null,
          Date.now(),
        ]
      );
    }
  });
}

// ----------------------------------------------------
// Generic KV Cache (Conversations & Messages)
// ----------------------------------------------------

export async function getCachedJson<T>(cacheKey: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM local_kv_cache WHERE cache_key = ?",
    [cacheKey]
  );
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function saveCachedJson(cacheKey: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO local_kv_cache (cache_key, value, updated_at) VALUES (?, ?, ?)",
    [cacheKey, JSON.stringify(value), Date.now()]
  );
}

/**
 * Completely wipes local offline SQLite storage (prescriptions, dose logs, cache, outbox)
 * Used on logout or when resetting the patient profile.
 */
export async function clearLocalDatabase(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM local_user_profile;
    DELETE FROM local_prescriptions;
    DELETE FROM local_adherence_logs;
    DELETE FROM sync_outbox;
    DELETE FROM local_appointments;
    DELETE FROM local_kv_cache;
  `);
}

