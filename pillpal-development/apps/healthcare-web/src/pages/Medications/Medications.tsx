import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Pill,
  Plus,
  Search,
  Stethoscope,
  X,
  PackageCheck,
  Send,
  User,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MedicationItem = {
  id: string;
  patientId: string;
  patientName: string;
  idNumber: string;
  name: string;
  dosage: string;
  frequency: string;
  instructions: string | null;
  scheduleTimes: string[];
  startDate: string;
  endDate: string | null;
  prescribedBy: string;
  status: "ACTIVE" | "COMPLETED" | "DISCONTINUED";
};

type PatientOption = {
  id: string;
  name: string;
  idNumber: string;
  department: string;
};

type InventoryStockOption = {
  id: string;
  name: string;
  brandName: string | null;
  strength: string;
  currentStock: number;
  status: string;
};

export function Medications() {
  const [medications, setMedications] = useState<MedicationItem[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [inventoryStock, setInventoryStock] = useState<InventoryStockOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [userRole, setUserRole] = useState<string>("DOCTOR");

  // Issue New Prescription Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState(false);

  const [formData, setFormData] = useState({
    patientId: "",
    inventoryItemId: "",
    name: "",
    dosage: "",
    frequency: "Once daily morning",
    scheduleTimesStr: "08:00 AM",
    instructions: "",
    startDate: new Date().toISOString().split("T")[0],
    dispenseInitialStock: false,
    dispenseQuantity: 14,
  });

  // Dispense Dose for Existing Prescription Modal State
  const [isDispenseModalOpen, setIsDispenseModalOpen] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState<MedicationItem | null>(null);
  const [dispenseForm, setDispenseForm] = useState({
    inventoryItemId: "",
    quantity: 1,
    reason: "",
  });
  const [dispenseLoading, setDispenseLoading] = useState(false);
  const [dispenseError, setDispenseError] = useState("");
  const [dispenseSuccess, setDispenseSuccess] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const [medRes, patRes, meRes, invRes] = await Promise.all([
        fetchWithAuth("/medications"),
        fetchWithAuth("/patients"),
        fetchWithAuth("/me"),
        fetchWithAuth("/inventory"),
      ]);

      if (medRes.ok) {
        const data = await medRes.json();
        setMedications(data);
      }

      if (patRes.ok) {
        const pData = await patRes.json();
        setPatients(
          pData.map((p: any) => ({
            id: p.id,
            name: p.name,
            idNumber: p.idNumber,
            department: p.department,
          }))
        );
        if (pData.length > 0 && !formData.patientId) {
          setFormData((prev) => ({ ...prev, patientId: pData[0].id }));
        }
      }

      if (invRes.ok) {
        const iData = await invRes.json();
        const items = Array.isArray(iData) ? iData : iData.items || [];
        setInventoryStock(
          items.map((i: any) => ({
            id: i.id,
            name: i.name,
            brandName: i.brandName || null,
            strength: i.strength,
            currentStock: i.currentStock,
            status: i.status,
          }))
        );
      }

      if (meRes.ok) {
        const u = await meRes.json();
        setUserRole(u.role || "DOCTOR");
      }
    } catch (err) {
      console.error("Failed to load medications data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleCreatePrescription(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    setModalLoading(true);

    try {
      const scheduleTimes = formData.scheduleTimesStr
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      if (scheduleTimes.length === 0) {
        throw new Error("Please specify at least one schedule time (e.g. 08:00 AM).");
      }

      const payload: any = {
        patientId: formData.patientId,
        name: formData.name,
        dosage: formData.dosage,
        frequency: formData.frequency,
        scheduleTimes,
        instructions: formData.instructions,
        startDate: formData.startDate,
      };

      if (formData.dispenseInitialStock && formData.inventoryItemId) {
        payload.inventoryItemId = formData.inventoryItemId;
        payload.dispenseQuantity = Number(formData.dispenseQuantity || 1);
      }

      const res = await fetchWithAuth("/medications", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create prescription");
      }

      setModalSuccess(true);
      setTimeout(() => {
        setModalSuccess(false);
        setIsModalOpen(false);
        setFormData({
          patientId: patients[0]?.id || "",
          inventoryItemId: "",
          name: "",
          dosage: "",
          frequency: "Once daily morning",
          scheduleTimesStr: "08:00 AM",
          instructions: "",
          startDate: new Date().toISOString().split("T")[0],
          dispenseInitialStock: false,
          dispenseQuantity: 14,
        });
        void loadData();
      }, 1200);
    } catch (err: any) {
      setModalError(err.message || "Failed to issue prescription.");
    } finally {
      setModalLoading(false);
    }
  }

  function openDispenseModal(med: MedicationItem) {
    setSelectedMedication(med);
    setDispenseError("");
    setDispenseSuccess("");

    // Attempt to match an inventory item with the same name
    const match = inventoryStock.find(
      (i) =>
        i.name.toLowerCase().includes(med.name.toLowerCase()) ||
        med.name.toLowerCase().includes(i.name.toLowerCase())
    );

    setDispenseForm({
      inventoryItemId: match?.id || inventoryStock[0]?.id || "",
      quantity: 1,
      reason: `Direct dose handover / prescribed refill for ${med.name} (${med.dosage})`,
    });
    setIsDispenseModalOpen(true);
  }

  async function handleDispensePrescription(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMedication) return;
    setDispenseError("");
    setDispenseLoading(true);

    try {
      const res = await fetchWithAuth(`/medications/${selectedMedication.id}/dispense`, {
        method: "POST",
        body: JSON.stringify({
          inventoryItemId: dispenseForm.inventoryItemId,
          quantity: Number(dispenseForm.quantity),
          reason: dispenseForm.reason,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to dispense medication to patient");
      }

      const resData = await res.json();
      setDispenseSuccess(resData.message || "Medication successfully dispensed to patient!");
      setTimeout(() => {
        setDispenseSuccess("");
        setIsDispenseModalOpen(false);
        void loadData();
      }, 1200);
    } catch (err: any) {
      setDispenseError(err.message || "Failed to dispense medication.");
    } finally {
      setDispenseLoading(false);
    }
  }

  const filtered = medications.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.patientName.toLowerCase().includes(search.toLowerCase()) ||
      m.idNumber.toLowerCase().includes(search.toLowerCase())
  );

  const selectedInventoryStockItem = inventoryStock.find(
    (i) => i.id === dispenseForm.inventoryItemId
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Medications & Prescriptions
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Prescribe regimens, dispense clinic inventory stock, and monitor student/faculty treatments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {userRole === "DOCTOR" || userRole === "ADMIN" ? (
            <Button
              onClick={() => setIsModalOpen(true)}
              className="gap-2 rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] shadow-xs cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Issue & Dispense Prescription
            </Button>
          ) : (
            <span className="text-[11px] text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl font-medium">
              Doctor authorization required to issue new prescriptions
            </span>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <Card className="rounded-2xl border border-slate-100 shadow-xs">
        <CardContent className="p-4">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search medication name, patient, or CSU ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs rounded-xl"
            />
          </div>
        </CardContent>
      </Card>

      {/* Medications Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">
          Loading prescriptions and treatments...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-100">
          No prescriptions found matching your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((med) => (
            <Card
              key={med.id}
              className="rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-[#0284c7] font-bold">
                        <Pill className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-bold text-slate-900">
                          {med.name}
                        </CardTitle>
                        <span className="text-xs font-semibold text-[#0284c7]">
                          {med.dosage}
                        </span>
                      </div>
                    </div>

                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      {med.status}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  <div className="rounded-xl bg-slate-50 p-2.5 text-xs">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Patient</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="font-bold text-slate-900">{med.patientName}</span>
                      <span className="font-mono text-[11px] text-slate-500">{med.idNumber}</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] text-slate-600 font-medium">
                      {med.frequency}
                    </p>
                    {med.instructions && (
                      <p className="text-[11px] text-slate-400 italic mt-0.5">
                        "{med.instructions}"
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {med.scheduleTimes.map((time, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow-2xs"
                        >
                          <Clock className="h-3 w-3 text-slate-400" />
                          {time}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </div>

              <div>
                <div className="px-6 py-2.5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                    <Stethoscope className="h-3 w-3 text-[#0284c7]" />
                    {med.prescribedBy}
                  </span>

                  {(userRole === "DOCTOR" || userRole === "HEALTH_STAFF" || userRole === "ADMIN") && (
                    <Button
                      size="sm"
                      onClick={() => openDispenseModal(med)}
                      className="h-7 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2.5 shadow-2xs gap-1 cursor-pointer"
                    >
                      <PackageCheck className="h-3.5 w-3.5" />
                      Dispense / Give Meds
                    </Button>
                  )}
                </div>

                <div className="px-6 py-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Prescription Active</span>
                  <span>Since {new Date(med.startDate).toLocaleDateString()}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* MODAL 1: NEW PRESCRIPTION & OPTIONAL DIRECT DISPENSE */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Issue Clinical Prescription</h2>
                <p className="text-xs text-slate-500">Prescribe medication regimen & optionally dispense initial stock from clinic pharmacy.</p>
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
                Prescription issued and stock updated successfully!
              </div>
            )}

            <form onSubmit={handleCreatePrescription} className="space-y-4 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Select CSU Patient</Label>
                <select
                  value={formData.patientId}
                  onChange={(e) => setFormData({ ...formData, patientId: e.target.value })}
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800 font-medium"
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.idNumber} - {p.department})
                    </option>
                  ))}
                </select>
              </div>

              {inventoryStock.length > 0 && (
                <div className="space-y-2 bg-sky-50/50 p-3 rounded-xl border border-sky-100">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-bold text-[#0284c7]">
                      Quick Pick from CSU Clinic Stock
                    </Label>
                    <span className="text-[10px] text-slate-500">Live Inventory</span>
                  </div>
                  <select
                    value={formData.inventoryItemId}
                    onChange={(e) => {
                      const selected = inventoryStock.find((i) => i.id === e.target.value);
                      if (selected) {
                        setFormData((prev) => ({
                          ...prev,
                          inventoryItemId: selected.id,
                          name: selected.name,
                          dosage: selected.strength,
                        }));
                      }
                    }}
                    className="w-full h-9 rounded-lg border border-slate-200 px-2 text-xs bg-white text-slate-800"
                  >
                    <option value="">
                      -- Select clinic stock to auto-fill generic name & dosage --
                    </option>
                    {inventoryStock.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name} ({inv.strength}) • {inv.currentStock} in stock{" "}
                        {inv.currentStock === 0 ? "(OUT OF STOCK)" : ""}
                      </option>
                    ))}
                  </select>

                  {formData.inventoryItemId && (
                    <div className="pt-2 border-t border-sky-200/60 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-[#0284c7]">
                        <input
                          type="checkbox"
                          checked={formData.dispenseInitialStock}
                          onChange={(e) =>
                            setFormData({ ...formData, dispenseInitialStock: e.target.checked })
                          }
                          className="rounded border-sky-300 text-[#0284c7]"
                        />
                        Dispense / Hand over initial stock to patient now
                      </label>

                      {formData.dispenseInitialStock && (
                        <div className="flex items-center gap-2">
                          <Label className="text-[11px] text-slate-600 whitespace-nowrap">Units to Dispense:</Label>
                          <Input
                            type="number"
                            min={1}
                            max={
                              inventoryStock.find((i) => i.id === formData.inventoryItemId)
                                ?.currentStock || 100
                            }
                            value={formData.dispenseQuantity}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                dispenseQuantity: Number(e.target.value),
                              })
                            }
                            className="w-24 h-8 rounded-lg text-xs bg-white"
                          />
                          <span className="text-[10px] text-slate-500">
                            (Stock available:{" "}
                            {inventoryStock.find((i) => i.id === formData.inventoryItemId)
                              ?.currentStock ?? 0}{" "}
                            units)
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Medication Generic / Brand Name</Label>
                  <Input
                    required
                    placeholder="e.g. Metformin Hydrochloride"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dosage Strength</Label>
                  <Input
                    required
                    placeholder="e.g. 500 mg or 100 mcg"
                    value={formData.dosage}
                    onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Dosing Frequency</Label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                  >
                    <option value="Once daily morning">Once daily morning</option>
                    <option value="Once daily bedtime">Once daily bedtime</option>
                    <option value="Twice daily">Twice daily</option>
                    <option value="3 times daily">3 times daily</option>
                    <option value="As needed (PRN)">As needed (PRN)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dose Timings (comma-separated)</Label>
                  <Input
                    required
                    placeholder="08:00 AM, 06:00 PM"
                    value={formData.scheduleTimesStr}
                    onChange={(e) => setFormData({ ...formData, scheduleTimesStr: e.target.value })}
                    className="rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Clinical Intake Instructions</Label>
                <Input
                  placeholder="e.g. Take 1 tablet with full glass of water after breakfast"
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="rounded-xl text-xs"
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
                  className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold text-white cursor-pointer"
                >
                  {modalLoading ? "Issuing..." : "Issue Prescription"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DISPENSE MEDICATION FOR EXISTING PRESCRIPTION */}
      {isDispenseModalOpen && selectedMedication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <PackageCheck className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">Dispense Medication</h2>
                  <p className="text-[11px] text-slate-500">Hand over physical dose from pharmacy inventory to patient.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDispenseModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {dispenseError && (
              <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {dispenseError}
              </div>
            )}

            {dispenseSuccess && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {dispenseSuccess}
              </div>
            )}

            {/* Prescription & Patient Context Box */}
            <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-2 border border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <User className="h-3 w-3" /> Patient
                </span>
                <span className="font-mono text-[11px] text-slate-500">{selectedMedication.idNumber}</span>
              </div>
              <p className="font-bold text-slate-900 text-sm">{selectedMedication.patientName}</p>
              
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-700">{selectedMedication.name}</span>
                <span className="font-bold text-[#0284c7]">{selectedMedication.dosage}</span>
              </div>
              <p className="text-[11px] text-slate-500">{selectedMedication.frequency}</p>
            </div>

            <form onSubmit={handleDispensePrescription} className="space-y-4 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Clinic Inventory Stock Item</Label>
                <select
                  value={dispenseForm.inventoryItemId}
                  onChange={(e) =>
                    setDispenseForm({ ...dispenseForm, inventoryItemId: e.target.value })
                  }
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800 font-medium"
                >
                  {inventoryStock.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.strength}) • Available: {item.currentStock} units
                    </option>
                  ))}
                </select>
                {selectedInventoryStockItem && (
                  <p className="text-[10px] text-slate-500">
                    Current clinic stock:{" "}
                    <span className="font-bold text-slate-800">
                      {selectedInventoryStockItem.currentStock} units
                    </span>{" "}
                    (Deducted via FEFO batch expiry).
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Quantity to Dispense (Units / Tablets / Vials)</Label>
                <Input
                  type="number"
                  min={1}
                  max={selectedInventoryStockItem?.currentStock || 100}
                  value={dispenseForm.quantity}
                  onChange={(e) =>
                    setDispenseForm({ ...dispenseForm, quantity: Number(e.target.value) })
                  }
                  required
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Dispensing Reason / Clinical Notes</Label>
                <Input
                  value={dispenseForm.reason}
                  onChange={(e) =>
                    setDispenseForm({ ...dispenseForm, reason: e.target.value })
                  }
                  placeholder="e.g. Regular dosage refill handed over directly"
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDispenseModalOpen(false)}
                  className="rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={dispenseLoading || (selectedInventoryStockItem?.currentStock ?? 0) <= 0}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white cursor-pointer shadow-xs gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  {dispenseLoading ? "Dispensing..." : "Confirm & Dispense Meds"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
