import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Clock,
  History,
  Package,
  PackageMinus,
  PackagePlus,
  Pill,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
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

type InventoryBatch = {
  id: string;
  batchNumber: string;
  quantity: number;
  expiryDate: string;
  supplier: string | null;
};

type InventoryItem = {
  id: string;
  name: string;
  brandName: string;
  strength: string;
  form: string;
  category: string;
  currentStock: number;
  minimumStock: number;
  status: "AVAILABLE" | "LOW_STOCK" | "OUT_OF_STOCK" | "EXPIRED";
  activeBatchesCount: number;
  closestExpiryDate: string | null;
  batches: InventoryBatch[];
};

type InventoryAlerts = {
  lowStockCount: number;
  outOfStockCount: number;
  expiringSoonCount: number;
  lowStockItems: InventoryItem[];
  outOfStockItems: InventoryItem[];
  expiringBatches: {
    id: string;
    medicationName: string;
    batchNumber: string;
    quantity: number;
    expiryDate: string;
    isExpired: boolean;
  }[];
};

type InventoryTransaction = {
  id: string;
  medicationName: string;
  form: string;
  type: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  batchNumber: string | null;
  reason: string | null;
  performedBy: string;
  createdAt: string;
};

export function Inventory() {
  const [activeTab, setActiveTab] = useState<"catalog" | "alerts" | "history">("catalog");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlerts>({
    lowStockCount: 0,
    outOfStockCount: 0,
    expiringSoonCount: 0,
    lowStockItems: [],
    outOfStockItems: [],
    expiringBatches: [],
  });
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // User role for RBAC
  const [userRole, setUserRole] = useState("HEALTH_STAFF");

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isDispenseModalOpen, setIsDispenseModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);

  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState(false);

  // Form states
  const [addItemForm, setAddItemForm] = useState({
    name: "",
    brandName: "",
    strength: "",
    form: "Tablet",
    category: "Antibiotics",
    minimumStock: "20",
  });

  const [receiveForm, setReceiveForm] = useState({
    itemId: "",
    batchNumber: "",
    quantity: "",
    expiryDate: "",
    supplier: "DOH Regional Medical Depot",
    reason: "New stock shipment delivery",
  });

  const [patientOptions, setPatientOptions] = useState<{ id: string; name: string; idNumber: string }[]>([]);

  const [dispenseForm, setDispenseForm] = useState({
    itemId: "",
    patientId: "",
    quantity: "1",
    type: "DISPENSED_OTC" as "DISPENSED_OTC" | "DISPENSED_RX",
    patientName: "",
    reason: "Clinical Care / Dispensed Treatment",
  });

  const [adjustForm, setAdjustForm] = useState({
    itemId: "",
    newStock: "",
    reason: "",
  });

  async function loadInventoryData() {
    setLoading(true);
    try {
      const [itemsRes, alertsRes, histRes, meRes, patRes] = await Promise.all([
        fetchWithAuth("/inventory"),
        fetchWithAuth("/inventory/alerts"),
        fetchWithAuth("/inventory/history"),
        fetchWithAuth("/me"),
        fetchWithAuth("/patients"),
      ]);

      if (itemsRes.ok) {
        const data = await itemsRes.json();
        setItems(data);
        if (data.length > 0 && !receiveForm.itemId) {
          setReceiveForm((prev) => ({ ...prev, itemId: data[0].id }));
          setDispenseForm((prev) => ({ ...prev, itemId: data[0].id }));
          setAdjustForm((prev) => ({ ...prev, itemId: data[0].id }));
        }
      }

      if (alertsRes.ok) {
        const aData = await alertsRes.json();
        setAlerts(aData);
      }

      if (histRes.ok) {
        const hData = await histRes.json();
        setTransactions(hData);
      }

      if (patRes.ok) {
        const pData = await patRes.json();
        setPatientOptions(pData.map((p: any) => ({ id: p.id, name: p.name, idNumber: p.idNumber })));
      }

      if (meRes.ok) {
        const u = await meRes.json();
        setUserRole(u.role || "HEALTH_STAFF");
      }
    } catch (err) {
      console.error("Failed to load inventory data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInventoryData();
  }, []);

  // Handle Add Item Catalog
  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    setModalLoading(true);

    try {
      const res = await fetchWithAuth("/inventory", {
        method: "POST",
        body: JSON.stringify(addItemForm),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to add medication to catalog");
      }

      setModalSuccess(true);
      setTimeout(() => {
        setModalSuccess(false);
        setIsAddModalOpen(false);
        setAddItemForm({
          name: "",
          brandName: "",
          strength: "",
          form: "Tablet",
          category: "Antibiotics",
          minimumStock: "20",
        });
        void loadInventoryData();
      }, 1000);
    } catch (err: any) {
      setModalError(err.message || "Failed to create inventory item.");
    } finally {
      setModalLoading(false);
    }
  }

  // Handle Receive Supply
  async function handleReceiveSupply(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    setModalLoading(true);

    try {
      const res = await fetchWithAuth(`/inventory/${receiveForm.itemId}/receive`, {
        method: "POST",
        body: JSON.stringify(receiveForm),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to receive supply");
      }

      setModalSuccess(true);
      setTimeout(() => {
        setModalSuccess(false);
        setIsReceiveModalOpen(false);
        setReceiveForm({
          itemId: items[0]?.id || "",
          batchNumber: "",
          quantity: "",
          expiryDate: "",
          supplier: "DOH Regional Medical Depot",
          reason: "New stock shipment delivery",
        });
        void loadInventoryData();
      }, 1000);
    } catch (err: any) {
      setModalError(err.message || "Failed to log supply intake.");
    } finally {
      setModalLoading(false);
    }
  }

  // Handle Dispense Medication
  async function handleDispense(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    setModalLoading(true);

    try {
      const selectedPat = patientOptions.find((p) => p.id === dispenseForm.patientId);
      const effectivePatientName = selectedPat
        ? `${selectedPat.name} (${selectedPat.idNumber})`
        : dispenseForm.patientName;

      const res = await fetchWithAuth(`/inventory/${dispenseForm.itemId}/dispense`, {
        method: "POST",
        body: JSON.stringify({
          quantity: parseInt(dispenseForm.quantity, 10),
          type: dispenseForm.type,
          patientId: dispenseForm.patientId || null,
          reason: effectivePatientName
            ? `${dispenseForm.reason} (Given to: ${effectivePatientName})`
            : dispenseForm.reason,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to dispense medication");
      }

      setModalSuccess(true);
      setTimeout(() => {
        setModalSuccess(false);
        setIsDispenseModalOpen(false);
        setDispenseForm({
          itemId: items[0]?.id || "",
          patientId: "",
          quantity: "1",
          type: "DISPENSED_OTC",
          patientName: "",
          reason: "Clinical Care / Dispensed Treatment",
        });
        void loadInventoryData();
      }, 1000);
    } catch (err: any) {
      setModalError(err.message || "Failed to dispense medication.");
    } finally {
      setModalLoading(false);
    }
  }

  // Handle Audit Stock Adjustment
  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    setModalLoading(true);

    try {
      const res = await fetchWithAuth(`/inventory/${adjustForm.itemId}/adjust`, {
        method: "POST",
        body: JSON.stringify(adjustForm),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to adjust stock count");
      }

      setModalSuccess(true);
      setTimeout(() => {
        setModalSuccess(false);
        setIsAdjustModalOpen(false);
        setAdjustForm({
          itemId: items[0]?.id || "",
          newStock: "",
          reason: "",
        });
        void loadInventoryData();
      }, 1000);
    } catch (err: any) {
      setModalError(err.message || "Failed to update audit count.");
    } finally {
      setModalLoading(false);
    }
  }

  const categories = ["ALL", ...Array.from(new Set(items.map((i) => i.category)))];

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.brandName.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = categoryFilter === "ALL" || item.category === categoryFilter;
    const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const totalStockCount = items.reduce((acc, curr) => acc + curr.currentStock, 0);

  return (
    <div className="space-y-6">
      {/* 1. Header & Action Center */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-[#0284c7] border border-sky-100">
              <Boxes className="h-3.5 w-3.5" />
              CSU Health Services Pharmacy
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Medication Inventory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage bulk clinic supplies, track batch lot expirations, and dispense treatments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(userRole === "HEALTH_STAFF" || userRole === "ADMIN") && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsAddModalOpen(true)}
                className="gap-1.5 rounded-xl text-xs font-bold cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                New Catalog Item
              </Button>
              <Button
                onClick={() => setIsReceiveModalOpen(true)}
                className="gap-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                <PackagePlus className="h-3.5 w-3.5" />
                Receive Supply
              </Button>
            </>
          )}
          <Button
            onClick={() => setIsDispenseModalOpen(true)}
            className="gap-1.5 rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white cursor-pointer shadow-xs"
          >
            <PackageMinus className="h-3.5 w-3.5" />
            Dispense / Give Medication
          </Button>
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Stock */}
        <Card className="rounded-2xl border border-slate-100 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Units On Hand
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-[#0284c7]">
              <Boxes className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{totalStockCount} Units</div>
            <p className="mt-1 text-[11px] text-slate-500 font-medium">
              Across {items.length} registered medications
            </p>
          </CardContent>
        </Card>

        {/* Low Stock Alert */}
        <Card
          className={`rounded-2xl border shadow-xs transition-shadow ${
            alerts.lowStockCount > 0 ? "border-amber-200 bg-amber-50/20" : "border-slate-100"
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Low Stock Alerts
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-800">{alerts.lowStockCount} Items</div>
            <p className="mt-1 text-[11px] text-amber-700 font-medium">
              Below minimum clinic threshold
            </p>
          </CardContent>
        </Card>

        {/* Expiring Soon */}
        <Card
          className={`rounded-2xl border shadow-xs transition-shadow ${
            alerts.expiringSoonCount > 0 ? "border-orange-200 bg-orange-50/20" : "border-slate-100"
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-orange-800 uppercase tracking-wider">
              Expiring in 60 Days
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-800">{alerts.expiringSoonCount} Batches</div>
            <p className="mt-1 text-[11px] text-orange-700 font-medium">
              Requires FEFO dispensing
            </p>
          </CardContent>
        </Card>

        {/* Out of Stock */}
        <Card
          className={`rounded-2xl border shadow-xs transition-shadow ${
            alerts.outOfStockCount > 0 ? "border-red-200 bg-red-50/20" : "border-slate-100"
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-red-800 uppercase tracking-wider">
              Out of Stock
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-red-700">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-800">{alerts.outOfStockCount} Items</div>
            <p className="mt-1 text-[11px] text-red-700 font-medium">
              Requires supply requisition
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("catalog")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "catalog"
              ? "bg-[#0284c7] text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Package className="h-4 w-4" />
          Stock Catalog ({items.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("alerts")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "alerts"
              ? "bg-[#0284c7] text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Alerts & Expiry ({alerts.lowStockCount + alerts.expiringSoonCount + alerts.outOfStockCount})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "history"
              ? "bg-[#0284c7] text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <History className="h-4 w-4" />
          Transaction Ledger ({transactions.length})
        </button>
      </div>

      {/* 4. TAB CONTENT: STOCK CATALOG */}
      {activeTab === "catalog" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <Card className="rounded-2xl border border-slate-100 shadow-xs">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search medication, brand, or category..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 text-xs rounded-xl"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 font-bold uppercase">Category:</span>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="h-8 rounded-xl border border-slate-200 px-2 text-xs bg-white text-slate-700"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 font-bold uppercase">Status:</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="h-8 rounded-xl border border-slate-200 px-2 text-xs bg-white text-slate-700"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="AVAILABLE">Available</option>
                      <option value="LOW_STOCK">Low Stock</option>
                      <option value="OUT_OF_STOCK">Out of Stock</option>
                    </select>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void loadInventoryData()}
                    className="h-8 rounded-xl text-xs text-slate-500 hover:text-slate-900"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Catalog Table */}
          <Card className="rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Medication Generic & Brand</th>
                    <th className="px-6 py-3.5">Strength / Form</th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5">Current Stock</th>
                    <th className="px-6 py-3.5">Batches / Nearest Expiry</th>
                    <th className="px-6 py-3.5">Status</th>
                    {userRole !== "DOCTOR" && <th className="px-6 py-3.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-xs text-slate-400">
                        Loading CSU clinic inventory catalog...
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-xs text-slate-400">
                        No medications found matching your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#0284c7] font-bold text-xs">
                              <Pill className="h-4.5 w-4.5" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{item.name}</p>
                              <p className="text-[11px] text-slate-400">{item.brandName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-800">
                          {item.strength} • <span className="text-slate-500">{item.form}</span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-medium">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-black text-slate-900">{item.currentStock}</span>
                          <span className="text-[10px] text-slate-400 ml-1">
                            (Min: {item.minimumStock})
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-[11px]">
                          {item.batches.length > 0 ? (
                            <div>
                              <span className="font-semibold text-slate-800">
                                {item.batches.length} active lot{item.batches.length > 1 ? "s" : ""}
                              </span>
                              <p className="text-[10px] text-slate-400">
                                Exp: {new Date(item.closestExpiryDate!).toLocaleDateString()}
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No batches</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              item.status === "AVAILABLE"
                                ? "bg-emerald-50 text-emerald-700"
                                : item.status === "LOW_STOCK"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-red-50 text-red-700"
                            }`}
                          >
                            {item.status === "AVAILABLE" && <CheckCircle2 className="h-3 w-3" />}
                            {item.status === "LOW_STOCK" && <AlertTriangle className="h-3 w-3" />}
                            {item.status === "OUT_OF_STOCK" && <ShieldAlert className="h-3 w-3" />}
                            {item.status}
                          </span>
                        </td>
                        {userRole !== "DOCTOR" && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setReceiveForm((prev) => ({ ...prev, itemId: item.id }));
                                  setIsReceiveModalOpen(true);
                                }}
                                className="h-7 rounded-lg text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                              >
                                Receive
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setDispenseForm((prev) => ({ ...prev, itemId: item.id }));
                                  setIsDispenseModalOpen(true);
                                }}
                                disabled={item.currentStock === 0}
                                className="h-7 rounded-lg text-[11px] font-semibold text-[#0284c7] hover:bg-sky-50"
                              >
                                Dispense
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setAdjustForm({
                                    itemId: item.id,
                                    newStock: item.currentStock.toString(),
                                    reason: "",
                                  });
                                  setIsAdjustModalOpen(true);
                                }}
                                className="h-7 rounded-lg text-[11px] text-slate-400 hover:text-slate-800"
                              >
                                Audit
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* 5. TAB CONTENT: ALERTS & EXPIRY */}
      {activeTab === "alerts" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Low Stock Items List */}
          <Card className="rounded-2xl border border-amber-200 bg-amber-50/10 shadow-xs">
            <CardHeader className="pb-3 border-b border-amber-100">
              <CardTitle className="text-sm font-bold text-amber-900 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Low Stock Critical Alerts ({alerts.lowStockItems.length})
              </CardTitle>
              <CardDescription className="text-xs text-amber-700">
                Medications that have fallen below minimum clinic stock levels.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-2.5">
              {alerts.lowStockItems.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center italic">
                  No medications currently at low stock.
                </p>
              ) : (
                alerts.lowStockItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl bg-white border border-amber-100 p-3 text-xs shadow-2xs"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{item.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {item.strength} • Min Threshold: {item.minimumStock}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-amber-700">
                        {item.currentStock} left
                      </span>
                      <Button
                        size="sm"
                        onClick={() => {
                          setReceiveForm((prev) => ({ ...prev, itemId: item.id }));
                          setIsReceiveModalOpen(true);
                        }}
                        className="mt-1 h-6 text-[10px] bg-amber-600 hover:bg-amber-700 font-bold block"
                      >
                        Restock
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Expiring Soon Batches List */}
          <Card className="rounded-2xl border border-orange-200 bg-orange-50/10 shadow-xs">
            <CardHeader className="pb-3 border-b border-orange-100">
              <CardTitle className="text-sm font-bold text-orange-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-600" />
                Batches Expiring in &lt; 60 Days ({alerts.expiringBatches.length})
              </CardTitle>
              <CardDescription className="text-xs text-orange-700">
                Lot numbers requiring First-Expired, First-Out (FEFO) dispensing priority.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-2.5">
              {alerts.expiringBatches.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center italic">
                  No active lots expiring in the next 60 days.
                </p>
              ) : (
                alerts.expiringBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="flex items-center justify-between rounded-xl bg-white border border-orange-100 p-3 text-xs shadow-2xs"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{batch.medicationName}</p>
                      <p className="font-mono text-[10px] text-slate-500">
                        Lot: {batch.batchNumber} • Qty: {batch.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-orange-700">
                        {new Date(batch.expiryDate).toLocaleDateString()}
                      </span>
                      <span className="block text-[10px] text-orange-600 font-semibold">
                        {batch.isExpired ? "EXPIRED" : "Prioritize Dispensing"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 6. TAB CONTENT: TRANSACTION LEDGER */}
      {activeTab === "history" && (
        <Card className="rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900">
                Immutable Stock Movement Ledger
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Complete chronological audit log of all receiving, dispensing, and audit recounts.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadInventoryData()}
              className="h-8 rounded-xl text-xs gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh Ledger
            </Button>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Timestamp</th>
                  <th className="px-6 py-3.5">Medication</th>
                  <th className="px-6 py-3.5">Event Type</th>
                  <th className="px-6 py-3.5">Quantity Delta</th>
                  <th className="px-6 py-3.5">Stock Shift</th>
                  <th className="px-6 py-3.5">Staff / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-xs text-slate-400">
                      No stock movement records found in ledger.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4 text-slate-500 text-[11px]">
                        {new Date(tx.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">
                        {tx.medicationName}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                            tx.type === "RECEIVED"
                              ? "bg-emerald-50 text-emerald-700"
                              : tx.type.startsWith("DISPENSED")
                              ? "bg-sky-50 text-sky-700"
                              : "bg-purple-50 text-purple-700"
                          }`}
                        >
                          {tx.type === "RECEIVED" && <ArrowUpRight className="h-3 w-3" />}
                          {tx.type.startsWith("DISPENSED") && <ArrowDownRight className="h-3 w-3" />}
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`font-mono text-xs font-bold ${
                            tx.quantity > 0 ? "text-emerald-600" : "text-slate-800"
                          }`}
                        >
                          {tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-[11px]">
                        {tx.previousStock} $\rightarrow$ <strong className="text-slate-900">{tx.newStock}</strong>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-800 text-[11px]">{tx.performedBy}</p>
                        <p className="text-[10px] text-slate-400 italic">{tx.reason || "—"}</p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 7. MODAL: ADD CATALOG ITEM */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">New Medication Catalog Item</h2>
                <p className="text-xs text-slate-500">Register a new pharmaceutical item to clinic roster.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
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
                Item added to catalog!
              </div>
            )}

            <form onSubmit={handleAddItem} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Generic Name</Label>
                  <Input
                    required
                    placeholder="e.g. Amoxicillin"
                    value={addItemForm.name}
                    onChange={(e) => setAddItemForm({ ...addItemForm, name: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Brand Name (Optional)</Label>
                  <Input
                    placeholder="e.g. Amoxil"
                    value={addItemForm.brandName}
                    onChange={(e) => setAddItemForm({ ...addItemForm, brandName: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Strength</Label>
                  <Input
                    required
                    placeholder="e.g. 500 mg"
                    value={addItemForm.strength}
                    onChange={(e) => setAddItemForm({ ...addItemForm, strength: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Form</Label>
                  <select
                    value={addItemForm.form}
                    onChange={(e) => setAddItemForm({ ...addItemForm, form: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                  >
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Inhaler">Inhaler</option>
                    <option value="Softgel">Softgel</option>
                    <option value="Sachet">Sachet</option>
                    <option value="Vial">Vial</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Min Threshold</Label>
                  <Input
                    type="number"
                    required
                    value={addItemForm.minimumStock}
                    onChange={(e) => setAddItemForm({ ...addItemForm, minimumStock: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Therapeutic Category</Label>
                <select
                  value={addItemForm.category}
                  onChange={(e) => setAddItemForm({ ...addItemForm, category: e.target.value })}
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                >
                  <option value="Antibiotics">Antibiotics</option>
                  <option value="Analgesics & Antipyretics">Analgesics & Antipyretics</option>
                  <option value="Antihypertensives">Antihypertensives</option>
                  <option value="Antidiabetics">Antidiabetics</option>
                  <option value="Respiratory">Respiratory</option>
                  <option value="Antihistamines">Antihistamines</option>
                  <option value="Gastrointestinal & Electrolytes">Gastrointestinal & Electrolytes</option>
                  <option value="NSAIDs / Anti-inflammatory">NSAIDs / Anti-inflammatory</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold"
                >
                  {modalLoading ? "Creating..." : "Save Catalog Item"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL: RECEIVE SUPPLY */}
      {isReceiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Receive Supply Shipment</h2>
                <p className="text-xs text-slate-500">Log incoming batch lots and restock clinic shelves.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsReceiveModalOpen(false)}
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
                Shipment intake logged and stock updated!
              </div>
            )}

            <form onSubmit={handleReceiveSupply} className="space-y-4 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Select Medication</Label>
                <select
                  value={receiveForm.itemId}
                  onChange={(e) => setReceiveForm({ ...receiveForm, itemId: e.target.value })}
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.strength} - {i.form}) • Current: {i.currentStock}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Batch / Lot Number</Label>
                  <Input
                    required
                    placeholder="e.g. LOT-2026-AMX02"
                    value={receiveForm.batchNumber}
                    onChange={(e) => setReceiveForm({ ...receiveForm, batchNumber: e.target.value })}
                    className="rounded-xl text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantity Received (Units)</Label>
                  <Input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 100"
                    value={receiveForm.quantity}
                    onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Batch Expiration Date</Label>
                  <Input
                    type="date"
                    required
                    value={receiveForm.expiryDate}
                    onChange={(e) => setReceiveForm({ ...receiveForm, expiryDate: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Supplier / Distributor</Label>
                  <Input
                    placeholder="e.g. DOH Regional Depot"
                    value={receiveForm.supplier}
                    onChange={(e) => setReceiveForm({ ...receiveForm, supplier: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Transaction / Delivery Note</Label>
                <Input
                  placeholder="e.g. Delivery receipt DR-84912"
                  value={receiveForm.reason}
                  onChange={(e) => setReceiveForm({ ...receiveForm, reason: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsReceiveModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  {modalLoading ? "Recording..." : "Receive Stock"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. MODAL: DISPENSE MEDICATION */}
      {isDispenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Dispense Medication</h2>
                <p className="text-xs text-slate-500">Deduct stock via First-Expired, First-Out (FEFO).</p>
              </div>
              <button
                type="button"
                onClick={() => setIsDispenseModalOpen(false)}
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
                Medication dispensed successfully!
              </div>
            )}

            <form onSubmit={handleDispense} className="space-y-4 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Select Medication</Label>
                <select
                  value={dispenseForm.itemId}
                  onChange={(e) => setDispenseForm({ ...dispenseForm, itemId: e.target.value })}
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id} disabled={i.currentStock === 0}>
                      {i.name} ({i.strength}) • Available: {i.currentStock} {i.currentStock === 0 ? "(OUT OF STOCK)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Dispensing Mode</Label>
                  <select
                    value={dispenseForm.type}
                    onChange={(e) => setDispenseForm({ ...dispenseForm, type: e.target.value as any })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                  >
                    <option value="DISPENSED_OTC">Walk-in OTC / Triage Care</option>
                    <option value="DISPENSED_RX">Prescription Dispensing (Rx)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantity to Dispense</Label>
                  <Input
                    type="number"
                    required
                    min="1"
                    value={dispenseForm.quantity}
                    onChange={(e) => setDispenseForm({ ...dispenseForm, quantity: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Select Registered CSU Patient (Optional)</Label>
                <select
                  value={dispenseForm.patientId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    const pat = patientOptions.find((p) => p.id === pid);
                    setDispenseForm({
                      ...dispenseForm,
                      patientId: pid,
                      patientName: pat ? `${pat.name} (${pat.idNumber})` : "",
                    });
                  }}
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                >
                  <option value="">-- Choose Registered Student / Patient or type below --</option>
                  {patientOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.idNumber})
                    </option>
                  ))}
                </select>
              </div>

              {!dispenseForm.patientId && (
                <div className="space-y-1">
                  <Label className="text-xs">Patient Name / CSU ID Number</Label>
                  <Input
                    placeholder="e.g. Maria Santos (2022-04912)"
                    value={dispenseForm.patientName}
                    onChange={(e) => setDispenseForm({ ...dispenseForm, patientName: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Dispensing Reason / Clinical Symptom</Label>
                <Input
                  placeholder="e.g. Headaches and mild fever during class"
                  value={dispenseForm.reason}
                  onChange={(e) => setDispenseForm({ ...dispenseForm, reason: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDispenseModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold"
                >
                  {modalLoading ? "Dispensing..." : "Confirm Dispensation"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. MODAL: AUDIT RECOUNT ADJUSTMENT */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Physical Stock Count Audit</h2>
                <p className="text-xs text-slate-500">Reconcile shelf discrepancy with mandatory audit note.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAdjustModalOpen(false)}
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
                Stock count reconciled in ledger!
              </div>
            )}

            <form onSubmit={handleAdjust} className="space-y-4 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Medication</Label>
                <select
                  value={adjustForm.itemId}
                  onChange={(e) => setAdjustForm({ ...adjustForm, itemId: e.target.value })}
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.strength}) • System Count: {i.currentStock}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">New Physical Shelf Count (Actual Units)</Label>
                <Input
                  type="number"
                  required
                  min="0"
                  value={adjustForm.newStock}
                  onChange={(e) => setAdjustForm({ ...adjustForm, newStock: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Mandatory Audit Note / Discrepancy Reason</Label>
                <Input
                  required
                  placeholder="e.g. Broken vial during triage, quarterly inventory count recount"
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold"
                >
                  {modalLoading ? "Saving..." : "Save Audit Adjustment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
