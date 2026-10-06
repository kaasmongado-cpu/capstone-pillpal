import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Stethoscope,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchWithAuth } from "@/lib/api";
import { CreateProviderDialog } from "@/components/providers/CreateProviderDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
type ProviderStatus = "ACTIVE" | "INACTIVE";

type Provider = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  workId: string | null;
  specialization: string | null;
  role: ProviderRole;
  userType: "HEALTHCARE_PROVIDER";
  status: ProviderStatus;
  createdAt: string;
  updatedAt: string;
};

export function Providers() {
  const navigate = useNavigate();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | ProviderRole>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ProviderStatus>("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Selected provider for View Details modal
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);

  // Selected provider for Edit modal
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    workId: "",
    specialization: "",
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  async function loadProviders(isManual = false) {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetchWithAuth("/providers");

      if (response.status === 401 || response.status === 403) {
        navigate("/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Unable to load healthcare providers.");
        return;
      }

      setProviders(data.providers ?? []);
    } catch {
      setError("Unable to connect to the PILLPAL server.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadProviders();
  }, []);

  async function handleStatusChange(provider: Provider) {
    setError("");
    setUpdatingId(provider.id);

    const newStatus: ProviderStatus =
      provider.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    try {
      const response = await fetchWithAuth(`/providers/${provider.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: newStatus,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Unable to update provider status.");
        return;
      }

      setProviders((prev) =>
        prev.map((p) =>
          p.id === provider.id ? { ...p, status: newStatus } : p,
        ),
      );

      if (selectedProvider?.id === provider.id) {
        setSelectedProvider((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch {
      setError("Unable to update provider status.");
    } finally {
      setUpdatingId(null);
    }
  }

  function handleOpenEdit(provider: Provider) {
    setEditingProvider(provider);
    setEditForm({
      firstName: provider.firstName,
      lastName: provider.lastName,
      phone: provider.phone || "",
      workId: provider.workId || "",
      specialization: provider.specialization || "",
    });
    setEditError("");
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProvider) return;

    setEditLoading(true);
    setEditError("");

    try {
      const response = await fetchWithAuth(`/providers/${editingProvider.id}`, {
        method: "PUT",
        body: JSON.stringify({
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          phone: editForm.phone || null,
          workId: editForm.workId,
          specialization:
            editingProvider.role === "DOCTOR"
              ? editForm.specialization || null
              : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setEditError(data.message || "Failed to update provider information.");
        return;
      }

      const updated = data.provider;
      setProviders((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );

      if (selectedProvider?.id === updated.id) {
        setSelectedProvider(updated);
      }

      setEditingProvider(null);
    } catch {
      setEditError("Server connection error while updating provider.");
    } finally {
      setEditLoading(false);
    }
  }

  const filteredProviders = useMemo(() => {
    return providers.filter((provider) => {
      const query = search.toLowerCase();
      const matchesSearch =
        provider.firstName.toLowerCase().includes(query) ||
        provider.lastName.toLowerCase().includes(query) ||
        provider.email.toLowerCase().includes(query) ||
        (provider.workId && provider.workId.toLowerCase().includes(query)) ||
        (provider.specialization &&
          provider.specialization.toLowerCase().includes(query));

      const matchesRole =
        roleFilter === "ALL" || provider.role === roleFilter;

      const matchesStatus =
        statusFilter === "ALL" || provider.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [providers, search, roleFilter, statusFilter]);

  const counts = useMemo(() => {
    const total = providers.length;
    const doctors = providers.filter((p) => p.role === "DOCTOR").length;
    const staff = providers.filter((p) => p.role === "HEALTH_STAFF").length;
    const active = providers.filter((p) => p.status === "ACTIVE").length;
    return { total, doctors, staff, active };
  }, [providers]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Healthcare Providers Directory
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage CSU clinical accounts, physician privileges, and health staff access.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadProviders(true)}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            className="gap-2 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Invite Provider
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Main Container */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4 border-b border-border/40">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Role Filter Tabs */}
            <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1">
              <button
                type="button"
                onClick={() => setRoleFilter("ALL")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  roleFilter === "ALL"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({counts.total})
              </button>

              <button
                type="button"
                onClick={() => setRoleFilter("DOCTOR")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  roleFilter === "DOCTOR"
                    ? "bg-background text-primary shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Stethoscope className="h-3.5 w-3.5" />
                Doctors ({counts.doctors})
              </button>

              <button
                type="button"
                onClick={() => setRoleFilter("HEALTH_STAFF")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  roleFilter === "HEALTH_STAFF"
                    ? "bg-background text-indigo-600 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                Health Staff ({counts.staff})
              </button>
            </div>

            {/* Status & Search */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, work ID, email..."
                  className="w-full sm:w-64 pl-9 text-xs"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "ALL" | ProviderStatus)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Inactive Only</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3.5">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-4">
                    <Skeleton className="h-6 w-20 rounded-md" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-8 w-16 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="p-16 text-center">
              <Users className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-3 text-base font-semibold text-foreground">No healthcare providers found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {search || roleFilter !== "ALL" || statusFilter !== "ALL"
                  ? "No accounts match your current filter criteria. Try clearing search filters."
                  : "Get started by inviting licensed CSU doctors and health staff to the PILLPAL network."}
              </p>
              {!search && roleFilter === "ALL" && (
                <Button
                  size="sm"
                  onClick={() => setCreateDialogOpen(true)}
                  className="mt-4 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Invite First Provider
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile Cards View (<md) */}
              <div className="divide-y divide-border/40 md:hidden">
                {filteredProviders.map((provider) => {
                  const isDoctor = provider.role === "DOCTOR";
                  const isActive = provider.status === "ACTIVE";

                  return (
                    <div key={provider.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs ${
                              isDoctor
                                ? "bg-primary/10 text-primary"
                                : "bg-indigo-500/10 text-indigo-600"
                            }`}
                          >
                            {provider.firstName[0]}
                            {provider.lastName[0]}
                          </div>

                          <div>
                            <p className="font-semibold text-foreground text-sm">
                              {isDoctor
                                ? `Dr. ${provider.firstName} ${provider.lastName}`
                                : `${provider.firstName} ${provider.lastName}`}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Mail className="h-3 w-3" />
                              {provider.email}
                            </p>
                          </div>
                        </div>

                        {/* Status Toggle on Mobile */}
                        <button
                          type="button"
                          onClick={() => handleStatusChange(provider)}
                          disabled={updatingId === provider.id}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0 transition-all ${
                            isActive
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                              : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isActive ? "bg-emerald-600" : "bg-amber-600"
                            }`}
                          />
                          {isActive ? "Active" : "Inactive"}
                        </button>
                      </div>

                      {/* Role, Work ID, Specialization */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {isDoctor ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10 text-[11px]">
                            <Stethoscope className="h-3 w-3" />
                            Doctor
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 text-[11px]">
                            <UserCheck className="h-3 w-3" />
                            Health Staff
                          </span>
                        )}

                        <span className="font-mono text-[11px] bg-muted px-2 py-0.5 rounded text-foreground">
                          {provider.workId ?? "No ID"}
                        </span>

                        {provider.specialization && (
                          <span className="inline-flex items-center rounded-md bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-800">
                            {provider.specialization}
                          </span>
                        )}
                      </div>

                      {/* Mobile Actions */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedProvider(provider)}
                          className="h-7 text-xs gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Details
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(provider)}
                          className="h-7 text-xs gap-1"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop / Tablet Table (md+) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border/60 bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3.5">Provider Details</th>
                      <th className="px-6 py-3.5">Role</th>
                      <th className="px-6 py-3.5">Work ID</th>
                      <th className="px-6 py-3.5">Specialization</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border/40">
                    {filteredProviders.map((provider) => {
                      const isDoctor = provider.role === "DOCTOR";
                      const isActive = provider.status === "ACTIVE";

                      return (
                        <tr
                          key={provider.id}
                          className="transition-colors hover:bg-muted/30"
                        >
                          {/* Provider Details */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs ${
                                  isDoctor
                                    ? "bg-primary/10 text-primary"
                                    : "bg-indigo-500/10 text-indigo-600"
                                }`}
                              >
                                {provider.firstName[0]}
                                {provider.lastName[0]}
                              </div>

                              <div>
                                <p className="font-semibold text-foreground">
                                  {isDoctor ? `Dr. ${provider.firstName} ${provider.lastName}` : `${provider.firstName} ${provider.lastName}`}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Mail className="h-3 w-3" />
                                  {provider.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Role Badge */}
                          <td className="px-6 py-4">
                            {isDoctor ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                <Stethoscope className="h-3 w-3" />
                                Doctor
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                                <UserCheck className="h-3 w-3" />
                                Health Staff
                              </span>
                            )}
                          </td>

                          {/* Work ID */}
                          <td className="px-6 py-4">
                            <span className="font-mono text-xs font-medium text-foreground bg-muted px-2 py-0.5 rounded">
                              {provider.workId ?? "N/A"}
                            </span>
                          </td>

                          {/* Specialization */}
                          <td className="px-6 py-4">
                            {provider.specialization ? (
                              <span className="inline-flex items-center rounded-md bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-800">
                                {provider.specialization}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* Status Toggle */}
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              onClick={() => handleStatusChange(provider)}
                              disabled={updatingId === provider.id}
                              title={`Click to ${isActive ? "deactivate" : "activate"}`}
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                                isActive
                                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 ring-1 ring-inset ring-emerald-600/20"
                                  : "bg-amber-50 text-amber-700 hover:bg-amber-100 ring-1 ring-inset ring-amber-600/20"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isActive ? "bg-emerald-600" : "bg-amber-600"
                                }`}
                              />
                              {updatingId === provider.id
                                ? "Updating..."
                                : isActive
                                ? "Active"
                                : "Inactive"}
                            </button>
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedProvider(provider)}
                                className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEdit(provider)}
                                className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* View Provider Details Modal */}
      {selectedProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-lg border-border/60 shadow-xl animate-in fade-in-0 zoom-in-95">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
              <div>
                <CardTitle className="text-lg">Provider Details</CardTitle>
                <CardDescription>Comprehensive clinician profile</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedProvider(null)}
                className="h-8 w-8 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <CardContent className="space-y-4 pt-4 text-sm">
              <div className="flex items-center gap-3.5 rounded-lg bg-muted/40 p-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                  {selectedProvider.firstName[0]}
                  {selectedProvider.lastName[0]}
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground">
                    {selectedProvider.role === "DOCTOR" ? `Dr. ` : ""}
                    {selectedProvider.firstName} {selectedProvider.lastName}
                  </h3>
                  <p className="text-xs text-muted-foreground">{selectedProvider.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Work ID</span>
                  <p className="font-mono text-xs font-semibold mt-0.5">{selectedProvider.workId || "—"}</p>
                </div>

                <div className="rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Phone Number</span>
                  <p className="text-xs font-medium mt-0.5">{selectedProvider.phone || "—"}</p>
                </div>

                <div className="rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Role Classification</span>
                  <p className="text-xs font-semibold text-primary mt-0.5">
                    {selectedProvider.role === "DOCTOR" ? "Licensed Physician (Doctor)" : "Clinic Health Staff"}
                  </p>
                </div>

                <div className="rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Specialization</span>
                  <p className="text-xs font-medium mt-0.5">{selectedProvider.specialization || "General Healthcare"}</p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <span className="text-xs text-muted-foreground">Account Access Status</span>
                  <p className="text-xs font-semibold mt-0.5">
                    {selectedProvider.status === "ACTIVE" ? "Active (Full Healthcare Web Access)" : "Inactive (Access Blocked)"}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant={selectedProvider.status === "ACTIVE" ? "outline" : "default"}
                  onClick={() => handleStatusChange(selectedProvider)}
                  disabled={updatingId === selectedProvider.id}
                  className="text-xs"
                >
                  {selectedProvider.status === "ACTIVE" ? "Deactivate Account" : "Activate Account"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Provider Modal */}
      {editingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-lg border-border/60 shadow-xl animate-in fade-in-0 zoom-in-95">
            <form onSubmit={handleSaveEdit}>
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
                <div>
                  <CardTitle className="text-lg">Edit Provider Information</CardTitle>
                  <CardDescription>Update clinician profile and identification</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => setEditingProvider(null)}
                  className="h-8 w-8 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>

              <CardContent className="space-y-4 pt-4">
                {editError && (
                  <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                    {editError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">First Name *</Label>
                    <Input
                      required
                      value={editForm.firstName}
                      onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Last Name *</Label>
                    <Input
                      required
                      value={editForm.lastName}
                      onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Work ID *</Label>
                    <Input
                      required
                      value={editForm.workId}
                      onChange={(e) => setEditForm({ ...editForm, workId: e.target.value })}
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Phone Number</Label>
                    <Input
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      placeholder="Optional"
                      className="text-xs"
                    />
                  </div>
                </div>

                {editingProvider.role === "DOCTOR" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Medical Specialization *</Label>
                    <Input
                      required
                      value={editForm.specialization}
                      onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })}
                      placeholder="e.g. Pediatrics, Cardiology, Internal Medicine"
                      className="text-xs"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingProvider(null)}
                  >
                    Cancel
                  </Button>

                  <Button
                    type="submit"
                    size="sm"
                    disabled={editLoading}
                  >
                    {editLoading ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </div>
      )}

      {/* Invite Provider Dialog */}
      <CreateProviderDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={() => loadProviders()}
      />
    </div>
  );
}