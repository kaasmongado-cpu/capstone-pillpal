import { useEffect, useState } from "react";
import {
  Calendar,
  Video,
  Plus,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  Send,
  Building,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AppointmentItem = {
  id: string;
  providerName: string;
  providerSpecialization: string;
  scheduledAt: string;
  requestedDate: string | null;
  reason: string;
  type: "IN_PERSON" | "TELEHEALTH";
  status: "PENDING" | "CONFIRMED" | "WAITING" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED";
  patientNotes: string | null;
  clinicalNotes: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  telehealthUrl: string | null;
  checkedInAt: string | null;
  createdAt: string;
};

export function Appointments() {
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"confirmed" | "pending" | "history">("confirmed");

  // Request Consultation Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");

  const [formData, setFormData] = useState({
    type: "IN_PERSON" as "IN_PERSON" | "TELEHEALTH",
    preferredDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    preferredTime: "09:00 AM",
    reason: "",
    notes: "",
  });

  // Cancel Appointment Modal
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  // View Clinical Notes Modal
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [viewNotesAppointment, setViewNotesAppointment] = useState<AppointmentItem | null>(null);

  async function loadAppointments() {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/appointments");
      if (res.ok) {
        const data = await res.json();
        setAppointments(data);
      }
    } catch (err) {
      console.error("Failed to load patient appointments:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAppointments();
  }, []);

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    setModalLoading(true);

    try {
      const scheduledAt = new Date(`${formData.preferredDate}T09:00:00`).toISOString();
      const res = await fetchWithAuth("/appointments", {
        method: "POST",
        body: JSON.stringify({
          scheduledAt,
          requestedDate: formData.preferredDate,
          reason: formData.reason,
          type: formData.type,
          patientNotes: `${formData.notes} (Preferred Time: ${formData.preferredTime})`.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to submit appointment request");
      }

      setModalSuccess("Appointment request submitted for clinic triage!");
      setTimeout(() => {
        setModalSuccess("");
        setIsModalOpen(false);
        setFormData({
          type: "IN_PERSON",
          preferredDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          preferredTime: "09:00 AM",
          reason: "",
          notes: "",
        });
        void loadAppointments();
      }, 1200);
    } catch (err: any) {
      setModalError(err.message || "Failed to submit request.");
    } finally {
      setModalLoading(false);
    }
  }

  async function handleLobbyCheckIn(aptId: string) {
    try {
      const res = await fetchWithAuth(`/appointments/${aptId}/check-in`, {
        method: "POST",
      });
      if (res.ok) {
        void loadAppointments();
      }
    } catch (err) {
      console.error("Failed to check-in:", err);
    }
  }

  async function handleCancelAppointment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAppointment) return;
    setCancelLoading(true);

    try {
      const res = await fetchWithAuth(`/appointments/${selectedAppointment.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason || "Cancelled by patient" }),
      });

      if (res.ok) {
        setIsCancelModalOpen(false);
        void loadAppointments();
      }
    } catch (err) {
      console.error("Cancel appointment error:", err);
    } finally {
      setCancelLoading(false);
    }
  }

  const confirmedList = appointments.filter(
    (a) => a.status === "CONFIRMED" || a.status === "WAITING" || a.status === "IN_PROGRESS"
  );
  const pendingList = appointments.filter((a) => a.status === "PENDING");
  const historyList = appointments.filter(
    (a) => a.status === "COMPLETED" || a.status === "REJECTED" || a.status === "CANCELLED"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Clinic Appointments & Consultations
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Book visits at CSU Infirmary, join video telehealth rooms, and view completed medical notes.
          </p>
        </div>

        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1.5 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Request New Consultation
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl w-full sm:w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("confirmed")}
          className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === "confirmed"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Upcoming Confirmed ({confirmedList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("pending")}
          className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === "pending"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Pending Triage ({pendingList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === "history"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          History & Completed ({historyList.length})
        </button>
      </div>

      {/* Tab 1: Upcoming Confirmed */}
      {activeTab === "confirmed" && (
        <div className="space-y-4">
          {loading ? (
            <div className="py-16 text-center text-xs text-slate-400">Loading appointments...</div>
          ) : confirmedList.length === 0 ? (
            <Card className="rounded-3xl border border-slate-200/80 p-12 text-center bg-white space-y-3">
              <Calendar className="h-10 w-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-black text-slate-700">No Upcoming Appointments</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                You have no scheduled consultations. Click "Request New Consultation" to book an appointment with CSU Clinic.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {confirmedList.map((apt) => (
                <Card
                  key={apt.id}
                  className="rounded-3xl border border-slate-200/80 bg-white shadow-xs p-5 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                          {apt.type === "TELEHEALTH" ? (
                            <Video className="h-5 w-5" />
                          ) : (
                            <Building className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-900">
                            {apt.providerName || "Assigned CSU Doctor"}
                          </h3>
                          <span className="text-[11px] font-bold text-emerald-700">
                            {apt.providerSpecialization || "General Medicine"}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                          apt.status === "WAITING"
                            ? "bg-amber-100 text-amber-800 animate-pulse"
                            : apt.status === "IN_PROGRESS"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-sky-100 text-[#0369a1]"
                        }`}
                      >
                        {apt.status === "WAITING" ? "Waiting in Lobby" : apt.status}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs space-y-1">
                      <p className="font-bold text-slate-800">Reason: "{apt.reason}"</p>
                      <p className="font-mono text-[11px] text-[#0284c7] font-bold">
                        Scheduled: {new Date(apt.scheduledAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAppointment(apt);
                        setIsCancelModalOpen(true);
                      }}
                      className="text-xs font-bold text-red-600 hover:text-red-700 cursor-pointer"
                    >
                      Cancel Visit
                    </button>

                    <div className="flex items-center gap-2">
                      {apt.type === "IN_PERSON" ? (
                        apt.status === "WAITING" ? (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                            Checked In • Awaiting Call
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleLobbyCheckIn(apt.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs gap-1 cursor-pointer"
                          >
                            <UserCheck className="h-4 w-4" />
                            I Have Arrived
                          </Button>
                        )
                      ) : (
                        <a href={apt.telehealthUrl || "#"} target="_blank" rel="noreferrer">
                          <Button
                            size="sm"
                            className="bg-[#0284c7] hover:bg-[#0369a1] text-white font-black text-xs rounded-xl shadow-xs gap-1 cursor-pointer"
                          >
                            <Video className="h-4 w-4" />
                            Join Video Call
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Pending Triage */}
      {activeTab === "pending" && (
        <div className="space-y-4">
          {pendingList.length === 0 ? (
            <Card className="rounded-3xl border border-slate-200/80 p-12 text-center bg-white space-y-2">
              <p className="text-xs text-slate-400">No pending consultation requests.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingList.map((apt) => (
                <Card
                  key={apt.id}
                  className="rounded-3xl border border-slate-200/80 bg-white p-5 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                        Awaiting Clinic Staff Triage
                      </span>
                      <h3 className="text-sm font-black text-slate-900 mt-2">
                        {apt.reason}
                      </h3>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">
                      {apt.type}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs space-y-1">
                    <p className="text-slate-600">
                      Requested for:{" "}
                      <span className="font-bold text-slate-900 font-mono">
                        {apt.requestedDate || new Date(apt.scheduledAt).toLocaleDateString()}
                      </span>
                    </p>
                    {apt.patientNotes && (
                      <p className="text-[11px] text-slate-500 italic">"{apt.patientNotes}"</p>
                    )}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAppointment(apt);
                        setIsCancelModalOpen(true);
                      }}
                      className="text-xs font-bold text-red-600 hover:text-red-700 cursor-pointer"
                    >
                      Withdraw Request
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: History & Completed */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {historyList.length === 0 ? (
            <Card className="rounded-3xl border border-slate-200/80 p-12 text-center bg-white space-y-2">
              <p className="text-xs text-slate-400">No past consultations recorded.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {historyList.map((apt) => (
                <Card
                  key={apt.id}
                  className="rounded-3xl border border-slate-200/80 bg-white p-5 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{apt.reason}</h3>
                      <p className="text-xs text-slate-500">{apt.providerName || "CSU Physician"}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                        apt.status === "COMPLETED"
                          ? "bg-emerald-100 text-emerald-800"
                          : apt.status === "CANCELLED"
                          ? "bg-amber-100 text-amber-900 border border-amber-200"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {apt.status === "CANCELLED" ? "CANCELLED / OVERDUE" : apt.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 font-mono">
                    Scheduled: {new Date(apt.scheduledAt).toLocaleDateString()} at {new Date(apt.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>

                  {apt.status === "COMPLETED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setViewNotesAppointment(apt);
                        setIsNotesModalOpen(true);
                      }}
                      className="w-full text-xs font-bold gap-1.5 rounded-xl text-[#0284c7] border-sky-200 hover:bg-sky-50"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      View Doctor's Consultation Summary
                    </Button>
                  )}

                  {apt.status === "REJECTED" && apt.rejectionReason && (
                    <p className="text-xs text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-100 font-medium">
                      Decline Reason: {apt.rejectionReason}
                    </p>
                  )}

                  {apt.status === "CANCELLED" && (
                    <div className="text-xs text-amber-800 bg-amber-50/80 p-2.5 rounded-xl border border-amber-200 space-y-0.5">
                      <p className="font-bold text-[11px]">Cancellation Note:</p>
                      <p className="text-slate-600 text-[11px]">
                        {apt.cancellationReason || "Appointment was cancelled."}
                      </p>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REQUEST CONSULTATION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Request Clinic Consultation</h2>
                <p className="text-xs text-slate-500">Book an in-person or telehealth visit at CSU Health Center.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {modalError}
              </div>
            )}

            {modalSuccess && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {modalSuccess}
              </div>
            )}

            <form onSubmit={handleCreateRequest} className="space-y-4 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Consultation Format</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: "IN_PERSON" })}
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                      formData.type === "IN_PERSON"
                        ? "border-emerald-600 bg-emerald-50/50 text-emerald-950 font-bold shadow-2xs"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <Building className="h-4 w-4 text-emerald-600 mb-1" />
                    <p className="text-xs font-black">In-Person Visit</p>
                    <p className="text-[10px] text-slate-400">CSU Campus Infirmary</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: "TELEHEALTH" })}
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                      formData.type === "TELEHEALTH"
                        ? "border-sky-600 bg-sky-50/50 text-sky-950 font-bold shadow-2xs"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <Video className="h-4 w-4 text-[#0284c7] mb-1" />
                    <p className="text-xs font-black">Telehealth Consultation</p>
                    <p className="text-[10px] text-slate-400">Secure Video Room</p>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Preferred Date</Label>
                  <Input
                    type="date"
                    required
                    value={formData.preferredDate}
                    onChange={(e) => setFormData({ ...formData, preferredDate: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Preferred Time Slot</Label>
                  <select
                    value={formData.preferredTime}
                    onChange={(e) => setFormData({ ...formData, preferredTime: e.target.value })}
                    className="w-full h-9.5 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                  >
                    <option value="08:30 AM">08:30 AM - Morning</option>
                    <option value="09:30 AM">09:30 AM - Morning</option>
                    <option value="10:30 AM">10:30 AM - Morning</option>
                    <option value="01:30 PM">01:30 PM - Afternoon</option>
                    <option value="02:30 PM">02:30 PM - Afternoon</option>
                    <option value="03:30 PM">03:30 PM - Afternoon</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Chief Complaint / Reason for Visit</Label>
                <Input
                  required
                  placeholder="e.g. Persistent headache, prescription refill, flu symptoms"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Additional Symptoms & Notes</Label>
                <textarea
                  rows={2}
                  placeholder="Describe your current symptoms or specific requirements..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  {modalLoading ? "Submitting..." : "Submit Consultation Request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      {isCancelModalOpen && selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="text-sm font-black text-slate-900">Cancel Appointment</h3>
            <p className="text-xs text-slate-500">
              Are you sure you want to cancel your consultation for "{selectedAppointment.reason}"?
            </p>

            <div className="space-y-1">
              <Label className="text-xs">Reason for cancellation</Label>
              <Input
                placeholder="e.g. Class conflict, feeling better"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="rounded-xl text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCancelModalOpen(false)}
                className="rounded-xl text-xs cursor-pointer"
              >
                Keep Visit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleCancelAppointment}
                disabled={cancelLoading}
                className="rounded-xl text-xs font-bold cursor-pointer"
              >
                {cancelLoading ? "Cancelling..." : "Confirm Cancellation"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW NOTES MODAL */}
      {isNotesModalOpen && viewNotesAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Doctor's Consultation Summary</h3>
                <p className="text-xs text-slate-500">
                  {viewNotesAppointment.providerName} • {new Date(viewNotesAppointment.scheduledAt).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNotesModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-xs font-mono whitespace-pre-line text-slate-800 border border-slate-100">
              {viewNotesAppointment.clinicalNotes || "No detailed notes recorded for this consultation."}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsNotesModalOpen(false)}
                className="rounded-xl text-xs cursor-pointer"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
