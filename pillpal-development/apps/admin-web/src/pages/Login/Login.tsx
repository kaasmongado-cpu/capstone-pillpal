import { useState } from "react";
import { ArrowRight, Lock, Mail, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { getSession, signIn } from "@pillpal/auth";
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

export function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 1. Sign in with Supabase Auth
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        setError(signInError.message);
        return;
      }

      // 2. Get current session
      const {
        data: { session },
      } = await getSession();

      if (!session) {
        setError("Unable to initialize an authenticated session.");
        return;
      }

      // 3. Ask API for user profile
      const response = await fetch(`${API_URL}/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Unable to verify PILLPAL user credentials.");
        return;
      }

      // 4. Role Guard: ADMIN only
      if (data.role !== "ADMIN") {
        setError("Access restricted. This account does not possess administrator privileges.");
        return;
      }

      navigate("/app/dashboard");
    } catch {
      setError("Unable to connect to the PILLPAL backend server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-muted/40 p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-md text-primary-foreground font-bold text-xl">
            P
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              PILLPAL Management
            </h1>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Caraga State University • Clinic Administration
            </p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="border-border/60 shadow-xl">
          <CardHeader className="space-y-1 pb-4 border-b border-border/40">
            <CardTitle className="text-lg">Sign in to Admin Portal</CardTitle>
            <CardDescription className="text-xs">
              Enter your authorized administrative credentials to manage CSU healthcare services.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium">
                  Administrator Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@pillpal.csu.edu.ph"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-9 text-xs"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full gap-2 shadow-sm font-semibold"
                disabled={loading}
              >
                {loading ? "Verifying Credentials..." : "Sign in to Dashboard"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Security and Initial Setup Note */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Encrypted Supabase Authentication</span>
          </div>

          <p className="text-[11px] text-muted-foreground">
            First time initializing the system?{" "}
            <Link
              to="/admin/setup"
              className="text-primary font-semibold hover:underline"
            >
              Run Initial Admin Setup
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}