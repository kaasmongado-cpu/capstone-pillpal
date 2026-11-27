// Web preview offline storage fallback (uses localStorage instead of native expo-sqlite)

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
  schedule_times: string[];
  start_date: string;
  end_date?: string | null;
  status: string;
  is_local_draft?: number;
  image_uri?: string | null;
}

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

const RX_KEY = "pillpal_web_prescriptions";
const LOGS_KEY = "pillpal_web_adherence_logs";
const OUTBOX_KEY = "pillpal_web_sync_outbox";

function readStore<T>(key: string): T[] {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStore<T>(key: string, items: T[]): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(items));
  } catch {
    // ignore storage limits
  }
}

export async function getDb(): Promise<null> {
  return null;
}

export async function initDatabase(): Promise<void> {
  // No-op on web preview
}

export async function getLocalPrescriptions(): Promise<LocalPrescription[]> {
  const all = readStore<LocalPrescription>(RX_KEY);
  const filtered = all.filter((rx) => rx.id !== "rx_demo_1" && !rx.id.startsWith("rx_demo"));
  if (filtered.length !== all.length) {
    writeStore(RX_KEY, filtered);
  }
  return filtered.filter((rx) => rx.status === "ACTIVE");
}

export async function getAllLocalPrescriptions(): Promise<LocalPrescription[]> {
  const all = readStore<LocalPrescription>(RX_KEY);
  const filtered = all.filter((rx) => rx.id !== "rx_demo_1" && !rx.id.startsWith("rx_demo"));
  if (filtered.length !== all.length) {
    writeStore(RX_KEY, filtered);
  }
  return filtered;
}

export async function deleteLocalPrescription(id: string): Promise<void> {
  const existing = readStore<LocalPrescription>(RX_KEY).filter((rx) => rx.id !== id);
  writeStore(RX_KEY, existing);
  const logs = readStore<LocalAdherenceLog>(LOGS_KEY).filter((log) => log.prescription_id !== id);
  writeStore(LOGS_KEY, logs);
}

export async function clearAllLocalPrescriptions(): Promise<void> {
  writeStore(RX_KEY, []);
  writeStore(LOGS_KEY, []);
}

export async function reconcileServerPrescriptions(serverRxs: any[]): Promise<void> {
  const serverIds = new Set(serverRxs.map((r) => r.id));
  const current = readStore<LocalPrescription>(RX_KEY);

  // Keep unsynced local drafts + new server prescriptions
  const unsyncedDrafts = current.filter((r) => r.is_local_draft === 1 && !serverIds.has(r.id));
  const newServerList: LocalPrescription[] = serverRxs.map((rx) => ({
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
  }));

  writeStore(RX_KEY, [...unsyncedDrafts, ...newServerList]);
}

export async function saveLocalPrescription(
  rx: Omit<LocalPrescription, "schedule_times"> & { schedule_times: string[] }
): Promise<void> {
  const existing = readStore<LocalPrescription>(RX_KEY);
  const idx = existing.findIndex((item) => item.id === rx.id);
  if (idx >= 0) {
    existing[idx] = rx;
  } else {
    existing.unshift(rx);
  }
  writeStore(RX_KEY, existing);

  if (rx.is_local_draft === 1) {
    const outbox = readStore<OutboxItem>(OUTBOX_KEY);
    outbox.push({
      id: `outbox_${rx.id}`,
      endpoint: "/medications/patient-regimen",
      http_method: "POST",
      payload: JSON.stringify({
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
      idempotency_key: `prescription_${rx.id}`,
      created_at: Date.now(),
      retry_count: 0,
    });
    writeStore(OUTBOX_KEY, outbox);
  }
}

export async function logDoseLocally(
  log: Omit<LocalAdherenceLog, "sync_status">,
  options: { enqueueOutbox?: boolean } = { enqueueOutbox: true },
): Promise<void> {
  const shouldEnqueue = options.enqueueOutbox !== false;
  const logs = readStore<LocalAdherenceLog>(LOGS_KEY).filter((l) => l.id !== log.id);
  logs.unshift({ ...log, sync_status: shouldEnqueue ? "PENDING" : "SYNCED" });
  writeStore(LOGS_KEY, logs);

  if (shouldEnqueue) {
    const outbox = readStore<OutboxItem>(OUTBOX_KEY).filter((x) => x.id !== log.id);
    outbox.push({
      id: log.id,
      endpoint: "/adherence",
      http_method: "POST",
      payload: JSON.stringify({
        prescriptionId: log.prescription_id,
        scheduledTime: log.scheduled_time,
        takenTime: log.taken_time ?? null,
        status: log.status,
        notes: log.notes ?? null,
      }),
      idempotency_key: `adherence_${log.id}`,
      created_at: Date.now(),
      retry_count: 0,
    });
    writeStore(OUTBOX_KEY, outbox);
  }
}

export async function upsertSyncedServerLog(
  log: Omit<LocalAdherenceLog, "sync_status">,
): Promise<void> {
  await logDoseLocally(log, { enqueueOutbox: false });
}

export async function getTodayLocalLogs(): Promise<LocalAdherenceLog[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const isoStart = startOfDay.toISOString();
  return readStore<LocalAdherenceLog>(LOGS_KEY).filter((l) => l.created_at >= isoStart);
}

export async function getPendingOutbox(): Promise<OutboxItem[]> {
  return readStore<OutboxItem>(OUTBOX_KEY);
}

export async function dequeueOutbox(id: string): Promise<void> {
  const outbox = readStore<OutboxItem>(OUTBOX_KEY).filter((item) => item.id !== id);
  writeStore(OUTBOX_KEY, outbox);
}

export async function markLogSynced(id: string): Promise<void> {
  const logs = readStore<LocalAdherenceLog>(LOGS_KEY).map((l) =>
    l.id === id ? { ...l, sync_status: "SYNCED" as const } : l
  );
  writeStore(LOGS_KEY, logs);
}

export async function enqueueOutboxAction(item: {
  id: string;
  endpoint: string;
  http_method: "POST" | "PATCH" | "PUT";
  payload: unknown;
  idempotency_key: string;
}): Promise<void> {
  const outbox = readStore<OutboxItem>(OUTBOX_KEY).filter((x) => x.id !== item.id);
  outbox.push({
    id: item.id,
    endpoint: item.endpoint,
    http_method: item.http_method,
    payload: JSON.stringify(item.payload),
    idempotency_key: item.idempotency_key,
    created_at: Date.now(),
    retry_count: 0,
  });
  writeStore(OUTBOX_KEY, outbox);
}

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

const APPTS_KEY = "pillpal_web_appointments";

export async function getLocalAppointments(): Promise<LocalAppointment[]> {
  return readStore<LocalAppointment>(APPTS_KEY);
}

export async function saveLocalAppointments(appointments: LocalAppointment[]): Promise<void> {
  const existing = readStore<LocalAppointment>(APPTS_KEY);
  const map = new Map(existing.map((a) => [a.id, a]));
  for (const appt of appointments) {
    map.set(appt.id, appt);
  }
  writeStore(APPTS_KEY, Array.from(map.values()));
}

export async function getCachedJson<T>(cacheKey: string): Promise<T | null> {
  try {
    const raw = globalThis.localStorage?.getItem(`pillpal_kv_${cacheKey}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function saveCachedJson(cacheKey: string, value: unknown): Promise<void> {
  try {
    globalThis.localStorage?.setItem(`pillpal_kv_${cacheKey}`, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export async function clearLocalDatabase(): Promise<void> {
  try {
    globalThis.localStorage?.removeItem(RX_KEY);
    globalThis.localStorage?.removeItem(LOGS_KEY);
    globalThis.localStorage?.removeItem(OUTBOX_KEY);
    globalThis.localStorage?.removeItem(APPTS_KEY);
  } catch {
    // ignore storage errors
  }
}

