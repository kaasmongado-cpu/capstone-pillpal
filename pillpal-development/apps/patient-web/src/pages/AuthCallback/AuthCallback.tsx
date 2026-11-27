import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { exchangeOAuthCode } from "@pillpal/auth";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Deduplicate React StrictMode double-mount calls for the same one-time OAuth code
const inFlightCodeExchanges = new Map<string, ReturnType<typeof exchangeOAuthCode>>();

function exchangeCodeOnce(code: string) {
  let promise = inFlightCodeExchanges.get(code);
  if (!promise) {
    promise = exchangeOAuthCode(code);
    inFlightCodeExchanges.set(code, promise);
  }
  return promise;
}

export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function finalizeGoogleSignIn() {
      const urlError = searchParams.get("error");
      if (urlError) {
        if (active) setError(urlError);
        return;
      }

      const code = searchParams.get("code")?.trim();
      if (!code) {
        if (active) {
          setError("No Google sign-in code was received. Please try signing in again.");
        }
        return;
      }

      const { data, error: exchangeErr } = await exchangeCodeOnce(code);
      if (!active) return;

      if (exchangeErr || !data.session) {
        inFlightCodeExchanges.delete(code);
        setError(exchangeErr?.message || "Unable to complete Google sign-in.");
        return;
      }

      if (data.needsProfileOnboarding) {
        navigate("/onboarding", { replace: true });
      } else {
        navigate("/app/dashboard", { replace: true });
      }
    }

    void finalizeGoogleSignIn();
    return () => {
      active = false;
    };
  }, [navigate, searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50/70 via-slate-50 to-sky-50/60 p-4">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white p-8 text-center shadow-xl space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white border border-slate-200/80 p-1.5 shadow-lg shadow-emerald-600/10">
          <img
            src="/pillpal-logo.png"
            alt="PILLPAL Logo"
            className="h-full w-full object-contain animate-pulse"
          />
        </div>

        {error ? (
          <>
            <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-xs font-semibold text-red-700 flex items-start gap-2 text-left">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
            <Button
              onClick={() => navigate("/login", { replace: true })}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10 cursor-pointer"
            >
              Return to Sign In
            </Button>
          </>
        ) : (
          <>
            <h2 className="text-base font-black text-slate-900">
              Completing Google Sign-In...
            </h2>
            <p className="text-xs text-slate-500">
              Connecting your verified Google account to CSU Health Services.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
