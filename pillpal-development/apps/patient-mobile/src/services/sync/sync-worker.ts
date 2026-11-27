import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import {
  getPendingOutbox,
  dequeueOutbox,
  markLogSynced,
  saveLocalPrescription,
  reconcileServerPrescriptions,
  getAllLocalPrescriptions,
  OutboxItem,
} from "../db/database";
import { syncPrescriptionAlarms } from "../notifications/alarms";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

type SyncListener = (isOnline: boolean, pendingCount: number) => void;
const listeners = new Set<SyncListener>();

let isOnlineState = true;
let pendingCountState = 0;

type UnreadListener = (unreadCount: number) => void;
const unreadListeners = new Set<UnreadListener>();
let unreadCountState = 0;

export function subscribeToUnreadMessages(listener: UnreadListener): () => void {
  unreadListeners.add(listener);
  listener(unreadCountState);
  return () => {
    unreadListeners.delete(listener);
  };
}

export function publishUnreadMessages(count: number): void {
  unreadCountState = Math.max(0, count);
  for (const listener of unreadListeners) {
    listener(unreadCountState);
  }
}

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
export async function pullServerPrescriptions(authToken?: string): Promise<void> {
  if (!isOnlineState && typeof navigator !== "undefined" && !navigator.onLine) return;

  try {
    let token = authToken;
    if (!token) {
      // Dynamic import to prevent circular dependency
      const { getAuthToken } = await import("../auth/session");
      token = (await getAuthToken()) || undefined;
    }
    if (!token) return;

    const res = await fetch(`${API_BASE_URL}/medications`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.ok) {
      const serverPrescriptions = await res.json();
      await reconcileServerPrescriptions(serverPrescriptions);
      // Automatically arm/disarm OS alarms for synced doctor & self-scanned prescriptions
      try {
        const allLocal = await getAllLocalPrescriptions();
        await syncPrescriptionAlarms(allLocal);
      } catch (alarmErr) {
        console.warn("Unable to reconcile local alarms after prescription sync:", alarmErr);
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

