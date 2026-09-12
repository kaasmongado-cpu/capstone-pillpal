import { useState } from "react";
import { X } from "lucide-react";
import { getSession } from "@pillpal/auth";
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

type ProviderRole = "DOCTOR" | "HEALTH_STAFF";

type CreateProviderDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

export function CreateProviderDialog({
  open,
  onClose,
  onCreated,
}: CreateProviderDialogProps) {
  const navigate = useNavigate();

  const [role, setRole] =
    useState<ProviderRole>("DOCTOR");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [workId, setWorkId] = useState("");
  const [specialization, setSpecialization] =
    useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setRole("DOCTOR");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setWorkId("");
    setSpecialization("");
    setError("");
    setSuccess("");
  }

  function handleClose() {
    if (loading) {
      return;
    }

    resetForm();
    onClose();
  }

  function handleRoleChange(
    newRole: ProviderRole,
  ) {
    setRole(newRole);

    if (newRole === "HEALTH_STAFF") {
      setSpecialization("");
    }

    setError("");
    setSuccess("");
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (
      role === "DOCTOR" &&
      !specialization.trim()
    ) {
      setError(
        "Specialization is required for doctors.",
      );
      return;
    }

    setLoading(true);

    try {
      const {
        data: { session },
      } = await getSession();

      if (!session) {
        setError(
          "Your admin session has expired. Please sign in again.",
        );

        navigate("/login");
        return;
      }

      const response = await fetch(
        `${API_URL}/providers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            firstName,
            lastName,
            email,
            phone: phone || undefined,
            workId,
            specialization:
              role === "DOCTOR"
                ? specialization
                : undefined,
            role,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.message ??
            "Unable to send the provider invitation.",
        );
        return;
      }

      setSuccess(
        `Invitation sent successfully to ${email}.`,
      );

      resetForm();

      onCreated?.();

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch {
      setError(
        "Unable to connect to the PILLPAL server.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-provider-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-background shadow-xl">
        <button
          type="button"
          onClick={handleClose}
          disabled={loading}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>

        <Card className="border-0 shadow-none">
          <CardHeader className="pr-16">
            <CardTitle id="create-provider-title">
              Invite Provider
            </CardTitle>

            <CardDescription>
              Create a Doctor or Health Staff account.
              An invitation email will be sent to the
              provider so they can set their own password.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form
              onSubmit={handleSubmit}
              className="space-y-6"
            >
              <div className="space-y-2">
                <Label htmlFor="provider-role">
                  Provider Type
                </Label>

                <select
                  id="provider-role"
                  value={role}
                  onChange={(event) =>
                    handleRoleChange(
                      event.target
                        .value as ProviderRole,
                    )
                  }
                  disabled={loading}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="DOCTOR">
                    Doctor
                  </option>

                  <option value="HEALTH_STAFF">
                    Health Staff
                  </option>
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="provider-first-name">
                    First Name
                  </Label>

                  <Input
                    id="provider-first-name"
                    type="text"
                    placeholder="First name"
                    value={firstName}
                    onChange={(event) =>
                      setFirstName(
                        event.target.value,
                      )
                    }
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="provider-last-name">
                    Last Name
                  </Label>

                  <Input
                    id="provider-last-name"
                    type="text"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(event) =>
                      setLastName(
                        event.target.value,
                      )
                    }
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider-email">
                  Email
                </Label>

                <Input
                  id="provider-email"
                  type="email"
                  placeholder="provider@example.com"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider-phone">
                  Phone Number
                </Label>

                <Input
                  id="provider-phone"
                  type="tel"
                  placeholder="09XXXXXXXXX"
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value)
                  }
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider-work-id">
                  Work ID
                </Label>

                <Input
                  id="provider-work-id"
                  type="text"
                  placeholder="Enter work ID"
                  value={workId}
                  onChange={(event) =>
                    setWorkId(event.target.value)
                  }
                  required
                  disabled={loading}
                />
              </div>

              {role === "DOCTOR" && (
                <div className="space-y-2">
                  <Label htmlFor="provider-specialization">
                    Specialization
                  </Label>

                  <Input
                    id="provider-specialization"
                    type="text"
                    placeholder="e.g. General Medicine"
                    value={specialization}
                    onChange={(event) =>
                      setSpecialization(
                        event.target.value,
                      )
                    }
                    required
                    disabled={loading}
                  />
                </div>
              )}

              <div className="rounded-md border bg-muted/40 p-4">
                <p className="text-sm font-medium">
                  Invitation Email
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  The provider will receive an email
                  containing a secure invitation link.
                  They will use the link to set their
                  own password and access PILLPAL.
                </p>
              </div>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">
                    {error}
                  </p>
                </div>
              )}

              {success && (
                <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3">
                  <p className="text-sm text-green-600">
                    {success}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={loading}
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  disabled={loading}
                >
                  {loading
                    ? "Sending Invitation..."
                    : "Send Invitation"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}