import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  HeartPulse,
  Phone,
  Pill,
  Search,
  UserCheck,
  X,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PatientItem = {
  id: string;
  userId: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  idNumber: string;
  department: string;
  type: "STUDENT" | "EMPLOYEE";
  gender: string;
  bloodType: string;
  allergies: string;
  medicalConditions: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  activeMedicationsCount: number;
  prescriptions: { id: string; name: string; dosage: string }[];
  adherenceRate: number;
  status: "ACTIVE" | "INACTIVE";
};

export function Patients() {
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "STUDENT" | "EMPLOYEE">("ALL");

  // Selected patient for detail modal
  const [selectedPatient, setSelectedPatient] = useState<PatientItem | null>(null);

  // Enrol modal state
  const [isEnrolOpen, setIsEnrolOpen] = useState(false);
  const [enrolLoading, setEnrolLoading] = useState(false);
  const [enrolError, setEnrolError] = useState("");
  const [enrolSuccess, setEnrolSuccess] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    idNumber: "",
    department: "College of Nursing",
    userType: "STUDENT" as "STUDENT" | "EMPLOYEE",
    gender: "Female",
    bloodType: "O+",
    allergies: "",
    medicalConditions: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  });

  async function loadPatients() {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/patients");
      if (res.ok) {
        const data = await res.json();
        setPatients(data);
      }
    } catch (err) {
      console.error("Failed to load patients:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPatients();
  }, []);

  async function handleEnrol(e: React.FormEvent) {
    e.preventDefault();
    setEnrolError("");
    setEnrolLoading(true);

    try {
      const res = await fetchWithAuth("/patients", {
        method: "POST",
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to enrol patient");
      }

      setEnrolSuccess(true);
      setTimeout(() => {
        setEnrolSuccess(false);
        setIsEnrolOpen(false);
        setFormData({
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          idNumber: "",
          department: "College of Nursing",
          userType: "STUDENT",
          gender: "Female",
          bloodType: "O+",
          allergies: "",
          medicalConditions: "",
          emergencyContactName: "",
          emergencyContactPhone: "",
        });
        void loadPatients();
      }, 1200);
    } catch (err: any) {
      setEnrolError(err.message || "Failed to enrol patient.");
    } finally {
      setEnrolLoading(false);
    }
  }

  const filtered = patients.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.idNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase()) ||
      p.department.toLowerCase().includes(search.toLowerCase());

    const matchesType = filterType === "ALL" || p.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Patient Directory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage CSU students and faculty registered in the PILLPAL clinical health network.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsEnrolOpen(true)}
            className="gap-2 rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] shadow-xs"
          >
            <UserCheck className="h-4 w-4" />
            Enrol CSU Patient
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <Card className="rounded-2xl border border-slate-100 shadow-xs">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by student ID, name, department..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs rounded-xl"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-slate-400 font-medium">Filter:</span>
              {(["ALL", "STUDENT", "EMPLOYEE"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilterType(t)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    filterType === t
                      ? "bg-sky-50 text-[#0284c7] border border-sky-100"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t === "ALL" ? "All Patients" : t === "STUDENT" ? "Students" : "Faculty / Staff"}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Patients Table */}
      <Card className="rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Patient Details</th>
                <th className="px-6 py-3.5">ID / Classification</th>
                <th className="px-6 py-3.5">Department</th>
                <th className="px-6 py-3.5">Active Meds</th>
                <th className="px-6 py-3.5">Adherence</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-xs text-slate-400">
                    Loading CSU clinical patient directory...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-xs text-slate-400">
                    No registered CSU patients found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((patient) => (
                  <tr key={patient.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[#0284c7] font-bold text-xs">
                          {patient.name[0]}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{patient.name}</p>
                          <p className="text-[11px] text-slate-400">{patient.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {patient.idNumber}
                      </span>
                      <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        {patient.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {patient.department}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                        <Pill className="h-3.5 w-3.5" />
                        {patient.activeMedicationsCount} Active
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                          patient.adherenceRate >= 90
                            ? "bg-emerald-50 text-emerald-700"
                            : patient.adherenceRate >= 80
                            ? "bg-blue-50 text-blue-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        <Activity className="h-3 w-3" />
                        {patient.adherenceRate}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPatient(patient)}
                        className="rounded-lg text-xs font-semibold"
                      >
                        View Profile
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Patient Detail Modal */}
      {selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-[#0284c7] font-bold text-base">
                  {selectedPatient.name[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-slate-900">{selectedPatient.name}</h2>
                    <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-[#0284c7]">
                      {selectedPatient.type}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-slate-400">
                    ID: {selectedPatient.idNumber} • {selectedPatient.department}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPatient(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-[10px] uppercase font-bold text-slate-400">Blood Type</p>
                <p className="text-sm font-black text-slate-900 mt-0.5">{selectedPatient.bloodType}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-[10px] uppercase font-bold text-slate-400">Adherence Rate</p>
                <p className="text-sm font-black text-emerald-600 mt-0.5">{selectedPatient.adherenceRate}%</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-[10px] uppercase font-bold text-slate-400">Gender</p>
                <p className="text-sm font-black text-slate-900 mt-0.5">{selectedPatient.gender}</p>
              </div>
            </div>

            {/* Clinical Health Background */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <HeartPulse className="h-4 w-4 text-[#0284c7]" />
                Clinical Background & Allergies
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-slate-100 p-3 space-y-1">
                  <span className="font-bold text-slate-500">Medical Conditions:</span>
                  <p className="text-slate-800 font-semibold">{selectedPatient.medicalConditions}</p>
                </div>
                <div className="rounded-xl border border-red-100 bg-red-50/20 p-3 space-y-1">
                  <span className="font-bold text-red-700">Known Allergies:</span>
                  <p className="text-red-900 font-semibold">{selectedPatient.allergies}</p>
                </div>
              </div>
            </div>

            {/* Contact & Emergency */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="h-4 w-4 text-[#0284c7]" />
                Contact & Emergency Information
              </h3>
              <div className="rounded-xl border border-slate-100 p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Institutional Email:</span>
                  <span className="font-semibold text-slate-800">{selectedPatient.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Primary Phone:</span>
                  <span className="font-semibold text-slate-800">{selectedPatient.phone}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-slate-500">Emergency Contact:</span>
                  <span className="font-bold text-slate-900">
                    {selectedPatient.emergencyContactName} ({selectedPatient.emergencyContactPhone})
                  </span>
                </div>
              </div>
            </div>

            {/* Active Prescriptions */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Pill className="h-4 w-4 text-[#0284c7]" />
                Active Prescriptions ({selectedPatient.prescriptions.length})
              </h3>
              {selectedPatient.prescriptions.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No active prescriptions currently on file.</p>
              ) : (
                <div className="space-y-2">
                  {selectedPatient.prescriptions.map((rx) => (
                    <div
                      key={rx.id}
                      className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs"
                    >
                      <span className="font-bold text-slate-800">{rx.name}</span>
                      <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 font-bold text-[#0284c7]">
                        {rx.dosage}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="outline"
                onClick={() => setSelectedPatient(null)}
                className="rounded-xl text-xs font-bold"
              >
                Close Profile
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Enrol Patient Modal */}
      {isEnrolOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Enrol New CSU Patient</h2>
                <p className="text-xs text-slate-500">Register a student or faculty member in PILLPAL.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEnrolOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {enrolError && (
              <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {enrolError}
              </div>
            )}

            {enrolSuccess && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Patient enrolled successfully!
              </div>
            )}

            <form onSubmit={handleEnrol} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">First Name</Label>
                  <Input
                    required
                    placeholder="e.g. Maria"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Last Name</Label>
                  <Input
                    required
                    placeholder="e.g. Santos"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Institutional Email</Label>
                  <Input
                    required
                    type="email"
                    placeholder="e.g. maria.santos@carsu.edu.ph"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone Number</Label>
                  <Input
                    placeholder="e.g. +63 917 123 4567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">CSU ID / Work ID</Label>
                  <Input
                    required
                    placeholder="2024-00123"
                    value={formData.idNumber}
                    onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Classification</Label>
                  <select
                    value={formData.userType}
                    onChange={(e) => setFormData({ ...formData, userType: e.target.value as any })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                  >
                    <option value="STUDENT">Student</option>
                    <option value="EMPLOYEE">Faculty / Staff</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Gender</Label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Department / College</Label>
                  <Input
                    required
                    placeholder="e.g. College of Nursing"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Blood Type</Label>
                  <select
                    value={formData.bloodType}
                    onChange={(e) => setFormData({ ...formData, bloodType: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                  >
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Medical Conditions</Label>
                  <Input
                    placeholder="e.g. Type 2 Diabetes, Asthma"
                    value={formData.medicalConditions}
                    onChange={(e) => setFormData({ ...formData, medicalConditions: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Known Allergies</Label>
                  <Input
                    placeholder="e.g. Penicillin, NSAIDs"
                    value={formData.allergies}
                    onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Emergency Contact Person</Label>
                  <Input
                    placeholder="e.g. Maria Santos (Mother)"
                    value={formData.emergencyContactName}
                    onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Emergency Contact Phone</Label>
                  <Input
                    placeholder="+63 917 987 6543"
                    value={formData.emergencyContactPhone}
                    onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEnrolOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={enrolLoading}
                  className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold"
                >
                  {enrolLoading ? "Enrolling..." : "Save Patient"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
