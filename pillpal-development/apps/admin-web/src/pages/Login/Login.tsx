import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getSession,
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

const API_URL = "http://localhost:4000";

export function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      // 1. Sign in with Supabase
      const { error: signInError } = await signIn(
        email,
        password,
      );

      if (signInError) {
        setError(signInError.message);
        return;
      }

      // 2. Get the current Supabase session
      const {
        data: { session },
      } = await getSession();

      if (!session) {
        setError("Unable to create an authenticated session.");
        return;
      }

      // 3. Ask the API for the PILLPAL user profile
      const response = await fetch(`${API_URL}/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      // 4. User must exist in PILLPAL
      if (!response.ok) {
        setError(
          data.message ?? "Unable to verify your PILLPAL account.",
        );
        return;
      }

      // 5. Only ADMIN can access this portal
      if (data.role !== "ADMIN") {
        setError(
          "Access denied. This account is not an administrator.",
        );
        return;
      }

      // 6. Admin authentication successful
      navigate("/app/dashboard");
    } catch {
      setError(
        "Unable to connect to the PILLPAL server.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">
            PILLPAL Admin Portal
          </CardTitle>

          <CardDescription>
            Sign in to manage healthcare provider accounts.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="email">
                Email
              </Label>

              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                Password
              </Label>

              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                required
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading
                ? "Signing in..."
                : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}