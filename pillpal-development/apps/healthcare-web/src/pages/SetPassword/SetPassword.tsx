import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  verifyProviderInvite,
  completeProviderInvite,
  signIn,
} from "@pillpal/auth";
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
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("token")?.trim() || "";

  const [providerInfo, setProviderInfo] = useState<{
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingToken, setCheckingToken] = useState(true);

  useEffect(() => {
    async function checkInvite() {
      if (!inviteToken) {
        setError(
          "No active invitation token found. Please open the invitation link from your email.",
        );
        setCheckingToken(false);
        return;
      }

      const result = await verifyProviderInvite(inviteToken);
      if (!result.valid || !result.provider) {
        setError(
          result.message ||
            "This invitation link has expired or has already been used.",
        );
      } else {
        setProviderInfo(result.provider);
      }
      setCheckingToken(false);
    }

    void checkInvite();
  }, [inviteToken]);

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
      const { email, error: setupError } = await completeProviderInvite(
        inviteToken,
        password,
      );

      if (setupError) {
        setError(
          setupError.message ||
            "Unable to set password. Your invitation link may have expired.",
        );
        return;
      }

      // Sign in automatically with the newly established Better Auth credentials
      const targetEmail = email || providerInfo?.email;
      if (targetEmail) {
        await signIn(targetEmail, password);
      }

      setSuccess(true);
      setTimeout(() => {
        navigate("/app/dashboard", { replace: true });
      }, 1400);
    } catch {
      setError("Unable to connect to the authentication server.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-[#0284c7] animate-pulse">
            <Stethoscope className="h-6 w-6 stroke-[2.2]" />
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Verifying invitation link...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50/80 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white border border-slate-200/80 p-1.5 shadow-md">
            <img
              src="/pillpal-logo.png"
              alt="PILLPAL Logo"
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900">
            Welcome to PILLPAL
          </h1>
          <p className="mt-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Establish Clinician Account Password
          </p>
        </div>

        <Card className="border border-slate-100 shadow-xl shadow-slate-200/50 rounded-2xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900">
              {providerInfo
                ? `Set Password for ${providerInfo.firstName} ${providerInfo.lastName}`
                : "Set Your Password"}
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {providerInfo
                ? `Account: ${providerInfo.email} (${providerInfo.role})`
                : "Create a strong password (minimum 8 characters) to access the CSU Healthcare Portal."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {success ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
                <p className="text-sm font-bold text-emerald-900">
                  Password Established!
                </p>
                <p className="text-xs text-emerald-700">
                  Redirecting you to your Healthcare Portal dashboard...
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-xs font-semibold text-red-700 flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-bold text-slate-700">
                    New Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      id="password"
                      type="password"
                      required
                      disabled={!providerInfo || loading}
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 text-xs rounded-xl h-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-bold text-slate-700">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      required
                      disabled={!providerInfo || loading}
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-9 text-xs rounded-xl h-10"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={!providerInfo || loading}
                  className="w-full h-10 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold text-xs cursor-pointer"
                >
                  {loading ? "Saving Password..." : "Activate Clinician Account"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
