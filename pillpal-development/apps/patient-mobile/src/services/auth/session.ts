import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import { signOut as supabaseSignOut } from "@pillpal/auth";

const TOKEN_KEY = "pillpal_auth_token";
const USER_KEY = "pillpal_cached_user";

export interface CachedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  department: string;
  bloodType?: string;
  allergies?: string;
  role: string;
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // ignore storage errors
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}

export async function saveAuthToken(token: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
}

export async function getAuthToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function clearAuthSession(): Promise<void> {
  await deleteItem(TOKEN_KEY);
  await deleteItem(USER_KEY);
  try {
    await supabaseSignOut();
  } catch {
    // ignore offline signOut errors
  }
}

export async function saveCachedUser(user: CachedUser): Promise<void> {
  await setItem(USER_KEY, JSON.stringify(user));
}

export async function getCachedUser(): Promise<CachedUser | null> {
  try {
    const raw = await getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Check if the device has biometric hardware (Face ID, Touch ID, Fingerprint)
 */
export async function isBiometricsAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: "Sign in to PILLPAL Patient",
      cancelLabel: "Use Password",
      fallbackLabel: "Use Password",
    });
    return res.success;
  } catch {
    return false;
  }
}
