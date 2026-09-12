import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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

type SetupStatus = {
  setupRequired: boolean;
};

export function AdminSetup() {
  const navigate = useNavigate();

  const [setupRequired, setSetupRequired] =
    useState<boolean | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] =
    useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function checkSetupStatus() {
      try {
        const response = await fetch(
          `${API_URL}/setup/admin/status`,
        );

        const data =
          (await response.json()) as SetupStatus;

        if (!response.ok) {
          setError(
            "Unable to check the admin setup status.",
          );
          return;
        }

        setSetupRequired(data.setupRequired);
      } catch {
        setError(
          "Unable to connect to the PILLPAL server.",
        );
      } finally {
        setCheckingSetup(false);
      }
    }

    void checkSetupStatus();
  }, []);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError(
        "Password must be at least 8 characters.",
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/setup/admin`,
        {
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
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.message ??
            "Unable to create the administrator account.",
        );
        return;
      }

      setSuccess(true);
      setSetupRequired(false);
    } catch {
      setError(
        "Unable to connect to the PILLPAL server.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSetup) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>
              Checking Admin Setup
            </CardTitle>

            <CardDescription>
              Please wait while we check whether PILLPAL
              has already been configured.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (error && setupRequired === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>
              Unable to Check Setup
            </CardTitle>

            <CardDescription>
              We couldn't determine whether the initial
              administrator setup has been completed.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="text-sm text-destructive">
              {error}
            </p>

            <Button
              className="w-full"
              onClick={() => navigate("/login")}
            >
              Go to Admin Login
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!setupRequired) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">
              Admin Setup Completed
            </CardTitle>

            <CardDescription>
              The initial PILLPAL administrator account
              has already been created.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Button
              className="w-full"
              onClick={() => navigate("/login")}
            >
              Continue to Admin Login
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">
              Administrator Created
            </CardTitle>

            <CardDescription>
              Your PILLPAL administrator account has been
              created successfully.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Button
              className="w-full"
              onClick={() => navigate("/login")}
            >
              Continue to Admin Login
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">
            PILLPAL Admin Setup
          </CardTitle>

          <CardDescription>
            Create the initial administrator account for
            the PILLPAL Admin Portal.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">
                  First Name
                </Label>

                <Input
                  id="firstName"
                  type="text"
                  placeholder="First name"
                  value={firstName}
                  onChange={(event) =>
                    setFirstName(event.target.value)
                  }
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">
                  Last Name
                </Label>

                <Input
                  id="lastName"
                  type="text"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(event) =>
                    setLastName(event.target.value)
                  }
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                Administrator Email
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
                placeholder="At least 8 characters"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                required
                minLength={8}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                Confirm Password
              </Label>

              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                required
                minLength={8}
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
                ? "Creating Administrator..."
                : "Create Administrator"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}