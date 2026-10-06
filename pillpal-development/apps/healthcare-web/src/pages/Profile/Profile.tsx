import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Shield,
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

export function Profile() {
  const [provider, setProvider] = useState({
    firstName: "Elena",
    lastName: "Cruz",
    email: "elena.cruz@csu.edu.ph",
    phone: "+63 917 555 1234",
    workId: "MED-2022-001",
    specialization: "General Medicine / Internal Medicine",
    role: "DOCTOR",
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetchWithAuth("/me");
        if (res.ok) {
          const user = await res.json();
          setProvider({
            firstName: user.firstName || "Elena",
            lastName: user.lastName || "Cruz",
            email: user.email || "elena.cruz@csu.edu.ph",
            phone: user.phone || "+63 917 555 1234",
            workId: user.workId || "MED-2022-001",
            specialization: user.specialization || "General Medicine",
            role: user.role || "DOCTOR",
          });
        }
      } catch {
        // use fallback sample
      }
    }
    void loadProfile();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 600);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          Provider Profile & Credentials
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          View and manage your personal details and professional clinical affiliations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Profile Card */}
        <Card className="rounded-2xl border border-slate-100 shadow-xs text-center p-6 space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#0284c7] text-white font-bold text-2xl shadow-md">
            {provider.firstName[0]}
          </div>

          <div>
            <h2 className="text-base font-bold text-slate-900">
              {provider.role === "DOCTOR" ? "Dr. " : ""}{provider.firstName} {provider.lastName}
            </h2>
            <p className="text-xs font-semibold text-[#0284c7] mt-0.5">
              {provider.role === "DOCTOR" ? provider.specialization : "Health Staff"}
            </p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              Active CSU Clinician
            </span>
          </div>

          <div className="pt-4 border-t border-slate-100 text-left space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              <span>CSU University Health Services</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-400" />
              <span>Work ID: <strong className="font-mono">{provider.workId}</strong></span>
            </div>
          </div>
        </Card>

        {/* Right Form Card */}
        <Card className="md:col-span-2 rounded-2xl border border-slate-100 shadow-xs">
          <CardHeader className="pb-4 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-900">
              Personal Information
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Contact information displayed on patient consultation slips and prescription notes.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>First Name</Label>
                  <Input
                    value={provider.firstName}
                    onChange={(e) => setProvider({ ...provider, firstName: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Last Name</Label>
                  <Input
                    value={provider.lastName}
                    onChange={(e) => setProvider({ ...provider, lastName: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Institutional Email Address</Label>
                <Input
                  value={provider.email}
                  disabled
                  className="rounded-xl text-xs bg-slate-50 text-slate-500"
                />
                <p className="text-[10px] text-slate-400">
                  Email and Employee ID are managed by the CSU Administration portal.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Phone / Clinic Extension</Label>
                <Input
                  value={provider.phone}
                  onChange={(e) => setProvider({ ...provider, phone: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>

              {saved && (
                <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Profile details updated successfully.
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold"
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
