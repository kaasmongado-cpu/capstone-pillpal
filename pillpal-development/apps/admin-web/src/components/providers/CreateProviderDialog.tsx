import { useState } from "react";
import { CheckCircle2, Mail, Stethoscope, UserCheck, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

  const [role, setRole] = useState<ProviderRole>("DOCTOR");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [workId, setWorkId] = useState("");
  const [specialization, setSpecialization] = useState("");

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
    if (loading) return;
    resetForm();
    onClose();
  }

  function handleRoleChange(newRole: ProviderRole) {
    setRole(newRole);
    if (newRole === "HEALTH_STAFF") {
      setSpecialization("");
    }
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (role === "DOCTOR" && !specialization.trim()) {
      setError("Specialization is required for doctors.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetchWithAuth("/providers", {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone: phone || undefined,
          workId,
          specialization: role === "DOCTOR" ? specialization : undefined,
          role,
        }),
      });

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        navigate("/login");
        return;
      }

      if (!response.ok) {
        setError(data.message ?? "Unable to send the provider invitation.");
        return;
      }

      setSuccess(`Invitation successfully sent to ${email}. They can now create their password.`);
      resetForm();
      onCreated?.();

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch {
      setError("Unable to connect to the PILLPAL server.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-background shadow-2xl animate-in fade-in-0 zoom-in-95 border border-border/60">
        <button
          type="button"
          onClick={handleClose}
          disabled={loading}
          className="absolute right-4 top-4 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <Card className="border-0 shadow-none">
          <CardHeader className="pr-14 pb-4 border-b border-border/50">
            <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
              <Mail className="h-4 w-4" />
              CSU Healthcare Provider Invitation
            </div>
            <CardTitle className="text-xl">Invite Clinician to PILLPAL</CardTitle>
            <CardDescription className="text-xs">
              The invited provider will receive an email verification link to establish their account password and access the Healthcare Web portal.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  {error}
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {/* Role Selection Cards */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Select Provider Role *</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleRoleChange("DOCTOR")}
                    className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                      role === "DOCTOR"
                        ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`rounded-md p-1.5 ${role === "DOCTOR" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        <Stethoscope className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-bold text-foreground">Doctor</span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Prescribes medications, sets clinical dosage schedules, monitors patients.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleChange("HEALTH_STAFF")}
                    className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                      role === "HEALTH_STAFF"
                        ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600 shadow-xs"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`rounded-md p-1.5 ${role === "HEALTH_STAFF" ? "bg-indigo-600 text-white" : "bg-muted text-muted-foreground"}`}>
                        <UserCheck className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-bold text-foreground">Health Staff</span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Clinic nurse/officer, logs check-ins, assists patients with adherence support.
                    </p>
                  </button>
                </div>
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName" className="text-xs font-medium">First Name *</Label>
                  <Input
                    id="firstName"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Maria"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="lastName" className="text-xs font-medium">Last Name *</Label>
                  <Input
                    id="lastName"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Santos"
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium">Email Address (CSU) *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="doctor@csu.edu.ph"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-medium">Phone Number</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Optional (e.g. 09123456789)"
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Work ID & Specialization */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="workId" className="text-xs font-medium">Work / License ID *</Label>
                  <Input
                    id="workId"
                    required
                    value={workId}
                    onChange={(e) => setWorkId(e.target.value)}
                    placeholder="e.g. CSU-MED-204"
                    className="text-xs"
                  />
                </div>

                {role === "DOCTOR" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="specialization" className="text-xs font-medium">Specialization *</Label>
                    <Input
                      id="specialization"
                      required
                      value={specialization}
                      onChange={(e) => setSpecialization(e.target.value)}
                      placeholder="e.g. General Medicine"
                      className="text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border/50">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClose}
                  disabled={loading}
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  size="sm"
                  disabled={loading}
                  className="gap-1.5 shadow-sm"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {loading ? "Sending Invitation..." : "Send Invitation"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}