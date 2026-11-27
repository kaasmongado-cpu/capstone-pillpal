import {
  getAuthApiUrl,
  getStoredAuthToken,
  setStoredAuthToken,
  clearStoredAuthToken,
} from "./client.js";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  userType?: string;
  status?: string;
  emailVerified?: boolean;
}

export interface AuthSession {
  access_token: string;
  user: AuthUser;
}

export interface AuthError {
  message: string;
  code?: string;
  status?: number;
}

async function parseJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function extractBearerToken(res: Response, body: any): string | null {
  return (
    res.headers.get("set-auth-token") ||
    body?.token ||
    body?.session?.token ||
    null
  );
}

export async function signUp(
  email: string,
  password: string,
  name?: string,
): Promise<{
  data: { user: AuthUser | null; session: AuthSession | null };
  error: AuthError | null;
}> {
  try {
    const apiUrl = getAuthApiUrl();
    const res = await fetch(`${apiUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        name: name || email.split("@")[0] || "PILLPAL User",
      }),
    });

    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        data: { user: null, session: null },
        error: {
          message: body?.message || "Unable to register account.",
          code: body?.code,
          status: res.status,
        },
      };
    }

    const token = extractBearerToken(res, body);
    const user: AuthUser | null = body?.user ?? null;

    if (token && user) {
      setStoredAuthToken(token);
      return {
        data: { user, session: { access_token: token, user } },
        error: null,
      };
    }

    return {
      data: { user, session: null },
      error: null,
    };
  } catch (err: any) {
    return {
      data: { user: null, session: null },
      error: { message: err?.message || "Failed to fetch" },
    };
  }
}

export async function signIn(
  email: string,
  password: string,
): Promise<{
  data: { user: AuthUser | null; session: AuthSession | null };
  error: AuthError | null;
}> {
  try {
    const apiUrl = getAuthApiUrl();
    const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
    });

    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        data: { user: null, session: null },
        error: {
          message: body?.message || "Invalid email or password.",
          code: body?.code,
          status: res.status,
        },
      };
    }

    const token = extractBearerToken(res, body);
    const user: AuthUser | null = body?.user ?? null;

    if (!token || !user) {
      return {
        data: { user: null, session: null },
        error: { message: "Authentication succeeded but no session token was returned." },
      };
    }

    setStoredAuthToken(token);

    return {
      data: {
        user,
        session: {
          access_token: token,
          user,
        },
      },
      error: null,
    };
  } catch (err: any) {
    return {
      data: { user: null, session: null },
      error: { message: err?.message || "Failed to fetch" },
    };
  }
}

export async function signOut(): Promise<{ error: AuthError | null }> {
  const token = getStoredAuthToken();
  clearStoredAuthToken();

  if (!token) {
    return { error: null };
  }

  try {
    const apiUrl = getAuthApiUrl();
    await fetch(`${apiUrl}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    return { error: null };
  } catch {
    // Still cleared locally for offline resilience
    return { error: null };
  }
}

export async function getSession(): Promise<{
  data: { session: AuthSession | null };
  error: AuthError | null;
}> {
  const token = getStoredAuthToken();
  if (!token) {
    return { data: { session: null }, error: null };
  }

  try {
    const apiUrl = getAuthApiUrl();
    const res = await fetch(`${apiUrl}/api/auth/get-session`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        clearStoredAuthToken();
      }
      return { data: { session: null }, error: null };
    }

    const body = await parseJsonSafe(res);
    if (!body?.user || !body?.session) {
      clearStoredAuthToken();
      return { data: { session: null }, error: null };
    }

    const refreshedToken = extractBearerToken(res, body) || token;
    if (refreshedToken !== token) {
      setStoredAuthToken(refreshedToken);
    }

    return {
      data: {
        session: {
          access_token: refreshedToken,
          user: body.user,
        },
      },
      error: null,
    };
  } catch {
    // Network unreachable — return minimal token-backed session so offline mode still works
    return {
      data: {
        session: {
          access_token: token,
          user: { id: "", email: "" },
        },
      },
      error: null,
    };
  }
}

export async function getUser(): Promise<{
  data: { user: AuthUser | null };
  error: AuthError | null;
}> {
  const { data, error } = await getSession();
  return {
    data: { user: data.session?.user ?? null },
    error,
  };
}

export async function updatePassword(
  newPassword: string,
  currentPassword?: string,
): Promise<{ error: AuthError | null }> {
  const token = getStoredAuthToken();
  if (!token) {
    return { error: { message: "No active session found." } };
  }

  try {
    const apiUrl = getAuthApiUrl();
    const res = await fetch(`${apiUrl}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        newPassword,
        currentPassword: currentPassword || "",
        revokeOtherSessions: false,
      }),
    });

    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        error: {
          message: body?.message || "Unable to update password.",
          code: body?.code,
          status: res.status,
        },
      };
    }

    return { error: null };
  } catch (err: any) {
    return { error: { message: err?.message || "Unable to connect to auth server." } };
  }
}

export async function sendVerificationOtp(
  email: string,
  type: "email-verification" | "forget-password" | "sign-in" = "email-verification",
): Promise<{ error: AuthError | null }> {
  try {
    const apiUrl = getAuthApiUrl();
    const res = await fetch(`${apiUrl}/api/auth/email-otp/send-verification-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        type,
      }),
    });

    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        error: {
          message: body?.message || "Unable to send verification code.",
          code: body?.code,
          status: res.status,
        },
      };
    }

    return { error: null };
  } catch (err: any) {
    return { error: { message: err?.message || "Failed to send verification code." } };
  }
}

export async function verifyEmailOtp(
  email: string,
  otp: string,
): Promise<{
  data: { user: AuthUser | null; session: AuthSession | null };
  error: AuthError | null;
}> {
  try {
    const apiUrl = getAuthApiUrl();
    const res = await fetch(`${apiUrl}/api/auth/email-otp/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      }),
    });

    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        data: { user: null, session: null },
        error: {
          message: body?.message || "Invalid or expired verification code.",
          code: body?.code,
          status: res.status,
        },
      };
    }

    const token = extractBearerToken(res, body);
    const user: AuthUser | null = body?.user ?? null;

    if (token && user) {
      setStoredAuthToken(token);
      return {
        data: { user, session: { access_token: token, user } },
        error: null,
      };
    }

    return {
      data: { user, session: null },
      error: null,
    };
  } catch (err: any) {
    return {
      data: { user: null, session: null },
      error: { message: err?.message || "Failed to verify code." },
    };
  }
}

export async function resetPasswordWithOtp(
  email: string,
  otp: string,
  password: string,
): Promise<{ error: AuthError | null }> {
  try {
    const apiUrl = getAuthApiUrl();
    const res = await fetch(`${apiUrl}/api/auth/email-otp/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        password,
      }),
    });

    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        error: {
          message: body?.message || "Invalid or expired reset code.",
          code: body?.code,
          status: res.status,
        },
      };
    }

    return { error: null };
  } catch (err: any) {
    return { error: { message: err?.message || "Failed to reset password." } };
  }
}

export async function verifyProviderInvite(token: string): Promise<{
  valid: boolean;
  provider?: { id: string; email: string; firstName: string; lastName: string; role: string };
  message?: string;
}> {
  try {
    const apiUrl = getAuthApiUrl();
    const res = await fetch(
      `${apiUrl}/auth/provider/verify-invite?token=${encodeURIComponent(token)}`,
    );
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return { valid: false, message: body?.message || "Invalid or expired invitation link." };
    }
    return { valid: true, provider: body.provider };
  } catch {
    return { valid: false, message: "Unable to connect to authentication server." };
  }
}

export async function completeProviderInvite(
  token: string,
  password: string,
): Promise<{ email?: string; error: AuthError | null }> {
  try {
    const apiUrl = getAuthApiUrl();
    const res = await fetch(`${apiUrl}/auth/provider/complete-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        error: {
          message: body?.message || "Unable to complete password setup.",
          status: res.status,
        },
      };
    }
    return { email: body.email, error: null };
  } catch (err: any) {
    return { error: { message: err?.message || "Unable to connect to authentication server." } };
  }
}

export async function getAuthProviders(): Promise<{ googleEnabled: boolean }> {
  try {
    const apiUrl = getAuthApiUrl();
    const res = await fetch(`${apiUrl}/auth/patient/providers`);
    if (!res.ok) return { googleEnabled: false };
    const body = await parseJsonSafe(res);
    return { googleEnabled: Boolean(body?.googleEnabled) };
  } catch {
    return { googleEnabled: false };
  }
}

export async function getGoogleAuthUrl(
  clientRedirectUrl: string,
): Promise<{ url: string | null; error: AuthError | null }> {
  try {
    const apiUrl = getAuthApiUrl();
    const bridgeCallbackUrl = `${apiUrl}/auth/patient/oauth-complete?redirect=${encodeURIComponent(clientRedirectUrl)}`;

    const res = await fetch(`${apiUrl}/api/auth/sign-in/social`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "google",
        callbackURL: bridgeCallbackUrl,
        errorCallbackURL: clientRedirectUrl,
        disableRedirect: true,
      }),
    });

    const body = await parseJsonSafe(res);
    if (!res.ok || !body?.url) {
      return {
        url: null,
        error: {
          message:
            body?.message ||
            "Google Sign-In is not yet configured on the server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.",
          code: body?.code,
          status: res.status,
        },
      };
    }

    return { url: body.url as string, error: null };
  } catch (err: any) {
    return {
      url: null,
      error: { message: err?.message || "Unable to start Google Sign-In." },
    };
  }
}

export async function exchangeOAuthCode(code: string): Promise<{
  data: {
    session: AuthSession | null;
    user: (AuthUser & { patientProfile?: any }) | null;
    needsProfileOnboarding: boolean;
  };
  error: AuthError | null;
}> {
  try {
    const apiUrl = getAuthApiUrl();
    const res = await fetch(`${apiUrl}/auth/patient/exchange-oauth-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const body = await parseJsonSafe(res);
    if (!res.ok || !body?.access_token || !body?.user) {
      return {
        data: { session: null, user: null, needsProfileOnboarding: false },
        error: {
          message: body?.message || "Unable to finalize Google sign-in.",
          status: res.status,
        },
      };
    }

    setStoredAuthToken(body.access_token);
    return {
      data: {
        session: {
          access_token: body.access_token,
          user: body.user,
        },
        user: body.user,
        needsProfileOnboarding: Boolean(body.needsProfileOnboarding),
      },
      error: null,
    };
  } catch (err: any) {
    return {
      data: { session: null, user: null, needsProfileOnboarding: false },
      error: { message: err?.message || "Unable to connect to authentication server." },
    };
  }
}

export async function setInitialPassword(
  newPassword: string,
): Promise<{ error: AuthError | null }> {
  const token = getStoredAuthToken();
  if (!token) {
    return { error: { message: "No active session found." } };
  }

  try {
    const apiUrl = getAuthApiUrl();
    const res = await fetch(`${apiUrl}/auth/patient/set-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ newPassword }),
    });

    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        error: {
          message: body?.message || "Unable to set portal password.",
          code: body?.code,
          status: res.status,
        },
      };
    }

    return { error: null };
  } catch (err: any) {
    return {
      error: { message: err?.message || "Unable to connect to auth server." },
    };
  }
}

export async function completePatientProfile(payload: {
  idNumber: string;
  department: string;
  firstName?: string;
  lastName?: string;
  userType?: "STUDENT" | "EMPLOYEE";
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  bloodType?: string;
  allergies?: string;
  medicalConditions?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  privacyConsent?: boolean;
  password?: string;
}): Promise<{ user: (AuthUser & { patientProfile?: any }) | null; error: AuthError | null }> {
  const token = getStoredAuthToken();
  if (!token) {
    return { user: null, error: { message: "No active session found." } };
  }

  try {
    const apiUrl = getAuthApiUrl();
    const res = await fetch(`${apiUrl}/auth/patient/complete-profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        user: null,
        error: {
          message: body?.message || "Unable to save CSU health profile.",
          status: res.status,
        },
      };
    }

    return { user: body.user ?? null, error: null };
  } catch (err: any) {
    return {
      user: null,
      error: { message: err?.message || "Unable to connect to server." },
    };
  }
}
