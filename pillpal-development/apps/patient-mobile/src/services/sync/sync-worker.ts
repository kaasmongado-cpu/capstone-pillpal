import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import {
  getPendingOutbox,
  dequeueOutbox,
  markLogSynced,
  saveLocalPrescription,
  OutboxItem,
} from "../db/database";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

type SyncListener = (isOnline: boolean, pendingCount: number) => void;
const listeners = new Set<SyncListener>();

let isOnlineState = true;
let pendingCountState = 0;

export function subscribeToSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(isOnlineState, pendingCountState);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  for (const listener of listeners) {
    listener(isOnlineState, pendingCountState);
  }
}

/**
 * Flush pending actions in sync_outbox to Node.js backend
 */
export async function flushOutbox(authToken?: string): Promise<{ flushed: number; errors: number }> {
  const pending = await getPendingOutbox();
  pendingCountState = pending.length;
  notifyListeners();

  if (pending.length === 0 || !isOnlineState) {
    return { flushed: 0, errors: 0 };
  }

  let flushed = 0;
  let errors = 0;

  for (const item of pending) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Idempotency-Key": item.idempotency_key,
      };

      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const res = await fetch(`${API_BASE_URL}${item.endpoint}`, {
        method: item.http_method,
        headers,
        body: item.payload,
      });

      if (res.ok || res.status === 409) {
        // 409 Conflict = already processed idempotently
        await dequeueOutbox(item.id);
        await markLogSynced(item.id);
        flushed++;
      } else {
        errors++;
      }
    } catch {
      errors++;
      break; // Network broke during flush, stop until next event
    }
  }

  const updatedPending = await getPendingOutbox();
  pendingCountState = updatedPending.length;
  notifyListeners();

  return { flushed, errors };
}

/**
 * Pull latest active prescriptions from server and cache to local SQLite
 */
export async function pullServerPrescriptions(authToken: string): Promise<void> {
  if (!isOnlineState) return;

  try {
    const res = await fetch(`${API_BASE_URL}/medications`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (res.ok) {
      const serverPrescriptions = await res.json();
      for (const rx of serverPrescriptions) {
        await saveLocalPrescription({
          id: rx.id,
          patient_id: rx.patientId,
          doctor_id: rx.doctorId,
          doctor_name: rx.doctor ? `${rx.doctor.firstName} ${rx.doctor.lastName}` : null,
          name: rx.name,
          dosage: rx.dosage,
          form: rx.form,
          instructions: rx.instructions,
          frequency: rx.frequency,
          schedule_times: rx.scheduleTimes || [],
          start_date: rx.startDate,
          end_date: rx.endDate,
          status: rx.status,
          is_local_draft: 0,
        });
      }
    }
  } catch (err) {
    console.warn("Offline: Unable to pull server prescriptions:", err);
  }
}

/**
 * Initialize NetInfo network listener to automatically trigger sync
 */
export function initSyncEngine(getAuthToken: () => Promise<string | null>): () => void {
  const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    isOnlineState = online;
    notifyListeners();

    if (online) {
      void (async () => {
        const token = await getAuthToken();
        if (token) {
          await flushOutbox(token);
          await pullServerPrescriptions(token);
        }
      })();
    }
  });

  return unsubscribe;
}

