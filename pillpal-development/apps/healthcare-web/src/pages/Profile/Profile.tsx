import { useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Shield,
  Stethoscope,
} from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";

type ProviderProfileState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  workId: string;
  specialization: string;
  role: "DOCTOR" | "HEALTH_STAFF" | "ADMIN";
  status: string;
};

export function Profile() {
  const [provider, setProvider] = useState<ProviderProfileState>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    workId: "",
    specialization: "",
    role: "DOCTOR",
    status: "ACTIVE",
  });
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function loadProfile() {
      setInitialLoading(true);
      setErrorMsg("");
      try {
        const res = await fetchWithAuth("/me");
        if (!res.ok) {
          throw new Error("Unable to load your provider profile.");
        }
        const user = await res.json();
        setProvider({
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          email: user.email || "",
          phone: user.phone || "",
          workId: user.workId || "",
          specialization: user.specialization || "",
          role: user.role || "DOCTOR",
          status: user.status || "ACTIVE",
        });
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed to load profile from server.");
      } finally {
        setInitialLoading(false);
      }
    }
    void loadProfile();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSavedMsg("");

    if (!provider.firstName.trim() || !provider.lastName.trim()) {
      setErrorMsg("First name and last name are required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetchWithAuth("/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: provider.firstName.trim(),
          lastName: provider.lastName.trim(),
          phone: provider.phone.trim(),
          specialization: provider.specialization.trim(),
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.message || "Failed to save profile changes.");
      }

      setProvider({
        firstName: body.firstName || "",
        lastName: body.lastName || "",
        email: body.email || "",
        phone: body.phone || "",
        workId: body.workId || "",
        specialization: body.specialization || "",
        role: body.role || "DOCTOR",
        status: body.status || "ACTIVE",
      });
      setSavedMsg("Profile details updated and saved.");
      window.dispatchEvent(new Event("pillpal:profile-updated"));
    } catch (err: any) {
      setErrorMsg(err?.message || "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }

  const displayInitial =
    (provider.firstName[0] || provider.email[0] || "C").toUpperCase();
  const displayName =
    `${provider.role === "DOCTOR" ? "Dr. " : ""}${provider.firstName} ${provider.lastName}`.trim() ||
    provider.email;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          Provider Profile &amp; Credentials
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          View and manage your personal details and professional clinical affiliations.
        </p>
      </div>

      {initialLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="rounded-2xl border border-slate-100 p-6 space-y-4">
            <Skeleton className="mx-auto h-20 w-20 rounded-full" />
            <Skeleton className="mx-auto h-5 w-36" />
            <Skeleton className="mx-auto h-4 w-28" />
          </Card>
          <Card className="md:col-span-2 rounded-2xl border border-slate-100 p-6 space-y-4">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Profile Card */}
          <Card className="rounded-2xl border border-slate-100 shadow-xs text-center p-6 space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#0284c7] text-white font-bold text-2xl shadow-md">
              {displayInitial}
            </div>

            <div>
              <h2 className="text-base font-bold text-slate-900">{displayName}</h2>
              <p className="text-xs font-semibold text-[#0284c7] mt-0.5">
                {provider.role === "DOCTOR"
                  ? provider.specialization || "Attending Physician"
                  : "Health Staff"}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                {provider.status === "ACTIVE" ? "Active CSU Clinician" : provider.status}
              </span>
            </div>

            <div className="pt-4 border-t border-slate-100 text-left space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                <span>CSU University Health Services</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-slate-400 shrink-0" />
                <span>
                  Work ID:{" "}
                  <strong className="font-mono">
                    {provider.workId || "Not assigned"}
                  </strong>
                </span>
              </div>
              {provider.role === "DOCTOR" && (
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-slate-400 shrink-0" />
                  <span>{provider.specialization || "General Medicine"}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Right Form Card */}
          <Card className="md:col-span-2 rounded-2xl border border-slate-100 shadow-xs">
            <CardHeader className="pb-4 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                Personal &amp; Clinical Information
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Contact details displayed on patient consultation slips and prescription notes.
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6">
              <form onSubmit={handleSave} className="space-y-4">
                {errorMsg && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {savedMsg && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{savedMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="prof-first-name">First Name</Label>
                    <Input
                      id="prof-first-name"
                      required
                      value={provider.firstName}
                      onChange={(e) =>
                        setProvider({ ...provider, firstName: e.target.value })
                      }
                      className="rounded-xl text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prof-last-name">Last Name</Label>
                    <Input
                      id="prof-last-name"
                      required
                      value={provider.lastName}
                      onChange={(e) =>
                        setProvider({ ...provider, lastName: e.target.value })
                      }
                      className="rounded-xl text-xs"
                    />
                  </div>
                </div>

                {provider.role === "DOCTOR" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="prof-specialization">Medical Specialization</Label>
                    <Input
                      id="prof-specialization"
                      placeholder="e.g. General Medicine, Internal Medicine, Pediatrics"
                      value={provider.specialization}
                      onChange={(e) =>
                        setProvider({ ...provider, specialization: e.target.value })
                      }
                      className="rounded-xl text-xs"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="prof-email">Institutional Email Address</Label>
                  <Input
                    id="prof-email"
                    value={provider.email}
                    disabled
                    className="rounded-xl text-xs bg-slate-50 text-slate-500"
                  />
                  <p className="text-[10px] text-slate-400">
                    Email, Role, and Work ID are managed by the CSU Administration portal.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prof-phone">Phone / Clinic Extension</Label>
                  <Input
                    id="prof-phone"
                    placeholder="e.g. 0917 555 1234 or (085) 341-2786"
                    value={provider.phone}
                    onChange={(e) =>
                      setProvider({ ...provider, phone: e.target.value })
                    }
                    className="rounded-xl text-xs"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold cursor-pointer"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
