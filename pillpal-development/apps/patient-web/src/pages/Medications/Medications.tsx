import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Pill,
  Clock,
  Stethoscope,
  Search,
  Calendar,
  ShieldCheck,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type PrescriptionItem = {
  id: string;
  name: string;
  dosage: string;
  form?: string;
  frequency: string;
  instructions: string | null;
  scheduleTimes: string[];
  startDate: string;
  endDate: string | null;
  status: "ACTIVE" | "COMPLETED" | "DISCONTINUED";
  prescribedBy: string;
};

export function Medications() {
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "COMPLETED">("ACTIVE");

  async function loadPrescriptions() {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/medications");
      if (res.ok) {
        const data = await res.json();
        setPrescriptions(data);
      }
    } catch (err) {
      console.error("Failed to load prescriptions:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPrescriptions();
  }, []);

  const filtered = prescriptions.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL" ? true : p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            My Medications & Prescriptions
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review your doctor-prescribed regimens, dosage schedules, and clinical instructions.
          </p>
        </div>

        <Link to="/app/appointments">
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1.5 cursor-pointer"
          >
            <Calendar className="h-4 w-4" />
            Request Prescription Refill / Visit
          </Button>
        </Link>
      </div>

      {/* Safety Notice */}
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-emerald-900 font-medium">
            Prescriptions are verified and issued by licensed CSU clinic physicians. Please take medications strictly as directed.
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search medicine name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs rounded-xl"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setStatusFilter("ACTIVE")}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              statusFilter === "ACTIVE"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Active Regimens
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("COMPLETED")}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              statusFilter === "COMPLETED"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Completed
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              statusFilter === "ALL"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Prescriptions List */}
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">
          Loading your active medications...
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-3xl border border-slate-200/80 p-12 text-center bg-white space-y-2">
          <p className="text-xs text-slate-400">No prescriptions found.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((item) => (
            <Card
              key={item.id}
              className="rounded-3xl border border-slate-200/80 bg-white shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden"
            >
              <div>
                <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/40">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 font-bold">
                        <Pill className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-black text-slate-900">
                          {item.name}
                        </CardTitle>
                        <span className="text-xs font-bold text-emerald-700">
                          {item.dosage}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                        item.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      Intake Instructions
                    </span>
                    <p className="text-slate-700 font-semibold bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      {item.instructions || item.frequency}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      Scheduled Timings
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {item.scheduleTimes.map((time, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-xs font-mono font-bold text-slate-700 shadow-2xs"
                        >
                          <Clock className="h-3 w-3 text-emerald-600" />
                          {time}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center gap-1 font-medium">
                      <Stethoscope className="h-3.5 w-3.5 text-[#0284c7]" />
                      Prescribed by {item.prescribedBy}
                    </span>
                    <span>
                      Since {new Date(item.startDate).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </div>

              <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">
                  Refill Needed?
                </span>
                <Link to="/app/appointments">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs font-bold rounded-xl text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                  >
                    Request Follow-up
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
