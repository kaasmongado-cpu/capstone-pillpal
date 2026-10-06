import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, supabase, updatePassword } from "@pillpal/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Lock, ShieldAlert, Stethoscope } from "lucide-react";

export function SetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // Check if the URL contains hash errors like #error=access_denied&error_code=otp_expired
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const errorDescription = params.get("error_description");
      const errorCode = params.get("error_code");

      if (errorCode === "otp_expired" || errorDescription?.includes("expired") || errorDescription?.includes("invalid")) {
        setError("This invitation link has expired or has already been used. Please request clinic administration to resend your invitation.");
        setCheckingSession(false);
        return;
      }
    }

    // Supabase auth state listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || session) {
          setCheckingSession(false);
        }
      }
    );

    // Also check current session
    async function checkCurrentSession() {
      try {
        const {
          data: { session },
        } = await getSession();
        if (session) {
          setCheckingSession(false);
        } else {
          // Give Supabase a moment to parse the URL hash
          setTimeout(async () => {
            const {
              data: { session: retrySession },
            } = await getSession();
            if (!retrySession && !window.location.hash) {
              setError("No active invitation session found. Please click the link in your email or sign in.");
            }
            setCheckingSession(false);
          }, 1000);
        }
      } catch {
        setCheckingSession(false);
      }
    }

    void checkCurrentSession();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await updatePassword(password);

      if (updateError) {
        setError(updateError.message ?? "Unable to update password. Your invitation link may have expired.");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        navigate("/app/dashboard", { replace: true });
      }, 1500);
    } catch {
      setError("Unable to connect to the authentication server.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-[#0284c7] animate-pulse">
            <Stethoscope className="h-6 w-6 stroke-[2.2]" />
          </div>
          <p className="text-xs font-semibold text-slate-500">Verifying invitation link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50/80 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-[#0284c7] border border-sky-100 shadow-2xs">
            <Stethoscope className="h-7 w-7 stroke-[2.2]" />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900">
            Welcome to PILLPAL
          </h1>
          <p className="mt-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Establish Clinician Account Password
          </p>
        </div>

        {/* Card */}
        <Card className="border border-slate-100 shadow-xl shadow-slate-200/50 rounded-2xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900">
              Set Your Password
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Create a secure password to access your CSU Healthcare Provider account.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/80 p-3 text-xs text-red-700">
                <ShieldAlert className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                <div className="space-y-2">
                  <p className="leading-snug">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/login")}
                    className="text-xs rounded-lg mt-1 h-7"
                  >
                    Go to Provider Login
                  </Button>
                </div>
              </div>
            )}

            {success ? (
              <div className="rounded-xl bg-emerald-50 p-4 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
                <p className="text-xs font-bold text-emerald-800">Password Established Successfully!</p>
                <p className="text-[11px] text-emerald-600">Redirecting to your Clinical Dashboard...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="rounded-xl text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="rounded-xl text-xs"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full font-bold h-10 mt-2 bg-[#0284c7] hover:bg-[#0369a1]"
                >
                  <Lock className="h-4 w-4 mr-1.5" />
                  {loading ? "Establishing Password..." : "Save Password & Enter Portal"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
