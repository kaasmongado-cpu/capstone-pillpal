import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  PhoneCall,
  HeartPulse,
  LogOut,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { signOut } from "@pillpal/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile() {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/me");
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  const patient = profile?.patientProfile;
  const fullName = profile ? `${profile.firstName} ${profile.lastName}` : "Maria Santos";

  if (loading) {
    return (
      <div className="py-20 text-center text-xs text-slate-400">
        Loading patient profile...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          Patient Profile & Health ID
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Your official Caraga State University student/employee digital medical identity card.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Digital Health Card */}
        <Card className="lg:col-span-1 rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-6 shadow-xl flex flex-col justify-between space-y-6 relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HeartPulse className="h-6 w-6 text-emerald-200" />
                <span className="font-black tracking-wider text-sm">CSU HEALTH ID</span>
              </div>
              <span className="rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase text-white backdrop-blur-xs">
                {profile?.userType || "STUDENT"}
              </span>
            </div>

            <div className="pt-2">
              <p className="text-xs text-emerald-200 uppercase font-bold">Patient Name</p>
              <h3 className="text-xl font-black text-white">{fullName}</h3>
              <p className="font-mono text-sm text-emerald-100 font-bold mt-0.5">
                ID: {patient?.idNumber || "2022-04912"}
              </p>
              <p className="text-xs text-emerald-100 font-medium">
                {patient?.department || "College of Nursing"}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-emerald-500/60 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-emerald-200">Blood Type:</span>
              <span className="font-black text-white">{patient?.bloodType || "O+"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-200">Known Allergies:</span>
              <span className="font-bold text-amber-200 truncate max-w-[150px]">
                {patient?.allergies || "No Known Allergies (NKA)"}
              </span>
            </div>
          </div>
        </Card>

        {/* Right: Detailed Medical & Contact Information */}
        <div className="lg:col-span-2 space-y-5">
          {/* Medical Safety Profile */}
          <Card className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h3 className="text-sm font-black text-slate-900">Clinical Safety Records</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-100 space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400">Known Drug Allergies</span>
                <p className="font-bold text-red-600 text-sm">
                  {patient?.allergies || "No Known Drug Allergies (NKA)"}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-100 space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400">Chronic Medical Conditions</span>
                <p className="font-bold text-slate-800 text-sm">
                  {patient?.medicalConditions || "None recorded"}
                </p>
              </div>
            </div>
          </Card>

          {/* Contact & Emergency Details */}
          <Card className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <PhoneCall className="h-5 w-5 text-emerald-600" />
              <h3 className="text-sm font-black text-slate-900">Contact & Emergency Person</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400">University Email</span>
                <p className="font-semibold text-slate-900">{profile?.email || "maria.santos@carsu.edu.ph"}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400">Mobile Phone</span>
                <p className="font-semibold text-slate-900">{patient?.emergencyContactPhone || "+63 912 345 6789"}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400">Emergency Contact Person</span>
                <p className="font-semibold text-slate-900">{patient?.emergencyContactName || "Elena Santos (Mother)"}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400">CSU Health Infirmary Hotline</span>
                <p className="font-bold text-emerald-700">(085) 341-2786 • clinic@carsu.edu.ph</p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                To update medical records, visit the CSU Clinic in person.
              </span>

              <Button
                variant="destructive"
                size="sm"
                onClick={handleLogout}
                className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
