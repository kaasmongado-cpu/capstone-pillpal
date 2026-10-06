import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getSession, signIn, signOut } from "@pillpal/auth";
import { fetchWithAuth } from "@/lib/api";
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
import { ShieldAlert, Stethoscope } from "lucide-react";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const passedError = (location.state as { error?: string } | null)?.error;
    if (passedError) {
      setError(passedError);
    }

    async function checkExistingAuth() {
      try {
        const {
          data: { session },
        } = await getSession();

        if (session) {
          const res = await fetchWithAuth("/me");
          if (res.ok) {
            const user = await res.json();
            if (
              (user.role === "DOCTOR" || user.role === "HEALTH_STAFF") &&
              user.status === "ACTIVE"
            ) {
              navigate("/app/dashboard", { replace: true });
              return;
            }
          }
        }
      } catch {
        // Continue to login
      } finally {
        setCheckingAuth(false);
      }
    }

    void checkExistingAuth();
  }, [location, navigate]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        setError(signInError.message ?? "Invalid provider email or password.");
        return;
      }

      const res = await fetchWithAuth("/me");
      if (!res.ok) {
        await signOut();
        setError("Unable to retrieve healthcare provider profile.");
        return;
      }

      const user = await res.json();

      if (user.role !== "DOCTOR" && user.role !== "HEALTH_STAFF") {
        await signOut();
        setError("Access restricted. Only Doctors and Health Staff may access this portal.");
        return;
      }

      if (user.status === "INACTIVE") {
        await signOut();
        setError("Your account has been deactivated. Please contact clinic management.");
        return;
      }

      navigate("/app/dashboard", { replace: true });
    } catch {
      setError("Unable to connect to the healthcare authentication service.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-[#0284c7] animate-pulse">
          <Stethoscope className="h-6 w-6 stroke-[2.2]" />
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
            PILLPAL Healthcare
          </h1>
          <p className="mt-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            CSU Medical & Health Provider Portal
          </p>
        </div>

        {/* Login Card */}
        <Card className="border border-slate-100 shadow-xl shadow-slate-200/50 rounded-2xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900">
              Clinician Sign In
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Enter your CSU institutional credentials to access patient records and clinical workflows.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/80 p-3 text-xs text-red-700">
                <ShieldAlert className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Provider Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="doctor@csu.edu.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
              </div>

              <Button
                type="submit"
                className="w-full font-bold h-10 mt-2 bg-[#0284c7] hover:bg-[#0369a1]"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In to Healthcare Portal"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Bottom Help Text */}
        <div className="text-center text-xs text-slate-400">
          <p>Need access? Contact CSU Clinic Administration to be invited.</p>
        </div>
      </div>
    </div>
  );
}
