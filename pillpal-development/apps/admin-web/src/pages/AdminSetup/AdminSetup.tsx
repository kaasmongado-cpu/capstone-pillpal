import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { API_URL } from "@/lib/api";
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

type SetupStatus = {
  setupRequired: boolean;
};

export function AdminSetup() {
  const navigate = useNavigate();

  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function checkSetupStatus() {
      try {
        const response = await fetch(`${API_URL}/setup/admin/status`);
        const data = (await response.json()) as SetupStatus;

        if (!response.ok) {
          setError("Unable to check admin setup status.");
          return;
        }

        setSetupRequired(data.setupRequired);
      } catch {
        setError("Unable to connect to the PILLPAL backend server.");
      } finally {
        setCheckingSetup(false);
      }
    }

    void checkSetupStatus();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/setup/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Unable to complete administrator account setup.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Unable to connect to the PILLPAL server.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSetup) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground animate-pulse">
          Checking platform initialization status...
        </p>
      </main>
    );
  }

  if (setupRequired === false && !success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-muted/40 p-4 sm:p-6">
        <Card className="w-full max-w-md border-border/60 shadow-xl text-center">
          <CardHeader className="pb-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-2">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">Setup Already Completed</CardTitle>
            <CardDescription className="text-xs">
              The primary administrator account has already been initialized for Caraga State University.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Button
              className="w-full gap-2 font-semibold"
              onClick={() => navigate("/login")}
            >
              Go to Sign In
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-muted/40 p-4 sm:p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-md text-primary-foreground font-bold text-xl">
            P
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Initial Platform Setup
            </h1>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Caraga State University • Clinic Management System
            </p>
          </div>
        </div>

        {/* Setup Card */}
        <Card className="border-border/60 shadow-xl">
          <CardHeader className="space-y-1 pb-4 border-b border-border/40">
            <CardTitle className="text-lg">Create Root Administrator Account</CardTitle>
            <CardDescription className="text-xs">
              This master administrative account will have authority to invite CSU doctors, manage clinic staff, and govern system policies.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            {success ? (
              <div className="space-y-4 text-center py-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Administrator Account Created!
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your account has been configured in Supabase and the NeonDB registry.
                  </p>
                </div>

                <Button
                  className="w-full gap-2 font-semibold mt-4"
                  onClick={() => navigate("/login")}
                >
                  Proceed to Sign In
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                    {error}
                  </div>
                )}

                {/* Name Fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-xs font-medium">First Name *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="firstName"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Admin"
                        className="pl-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" className="text-xs font-medium">Last Name *</Label>
                    <Input
                      id="lastName"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Officer"
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium">Administrator Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@pillpal.csu.edu.ph"
                      className="pl-9 text-xs"
                    />
                  </div>
                </div>

                {/* Password Fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-medium">Password *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 8 chars"
                        className="pl-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-xs font-medium">Confirm Password *</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="text-xs"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full gap-2 shadow-sm font-semibold mt-2"
                  disabled={loading}
                >
                  {loading ? "Configuring Administrator..." : "Complete Setup & Initialize"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground">
          Already configured?{" "}
          <Link to="/login" className="text-primary font-semibold hover:underline">
            Go to Login
          </Link>
        </div>
      </div>
    </main>
  );
}