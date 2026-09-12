import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserX,
} from "lucide-react";
import { getSession } from "@pillpal/auth";
import { useNavigate } from "react-router-dom";

import { CreateProviderDialog } from "@/components/providers/CreateProviderDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const API_URL = "http://localhost:4000";

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

  const [providers, setProviders] = useState<Provider[]>(
    [],
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] =
    useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] =
    useState(false);

  async function loadProviders() {
    setError("");
    setLoading(true);

    try {
      const {
        data: { session },
      } = await getSession();

      if (!session) {
        navigate("/login");
        return;
      }

      const response = await fetch(
        `${API_URL}/providers`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.message ??
            "Unable to load healthcare providers.",
        );
        return;
      }

      setProviders(data.providers ?? []);
    } catch {
      setError(
        "Unable to connect to the PILLPAL server.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProviders();
  }, []);

  async function handleStatusChange(
    provider: Provider,
  ) {
    setError("");
    setUpdatingId(provider.id);

    const newStatus: ProviderStatus =
      provider.status === "ACTIVE"
        ? "INACTIVE"
        : "ACTIVE";

    try {
      const {
        data: { session },
      } = await getSession();

      if (!session) {
        navigate("/login");
        return;
      }

      const response = await fetch(
        `${API_URL}/providers/${provider.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            status: newStatus,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.message ??
            "Unable to update provider status.",
        );
        return;
      }

      setProviders((currentProviders) =>
        currentProviders.map((currentProvider) =>
          currentProvider.id === provider.id
            ? {
                ...currentProvider,
                status: newStatus,
              }
            : currentProvider,
        ),
      );
    } catch {
      setError(
        "Unable to connect to the PILLPAL server.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  const filteredProviders = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return providers;
    }

    return providers.filter((provider) => {
      const fullName =
        `${provider.firstName} ${provider.lastName}`.toLowerCase();

      const role =
        provider.role === "DOCTOR"
          ? "doctor"
          : "health staff";

      return (
        fullName.includes(query) ||
        provider.email
          .toLowerCase()
          .includes(query) ||
        provider.workId
          ?.toLowerCase()
          .includes(query) ||
        role.includes(query) ||
        provider.specialization
          ?.toLowerCase()
          .includes(query)
      );
    });
  }, [providers, search]);

  function getProviderRoleLabel(
    role: ProviderRole,
  ) {
    return role === "DOCTOR"
      ? "Doctor"
      : "Health Staff";
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              Healthcare Providers
            </h1>

            <p className="text-sm text-muted-foreground">
              Manage PILLPAL Doctor and Health Staff
              accounts.
            </p>
          </div>

          <Button
            onClick={() =>
              setCreateDialogOpen(true)
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Provider
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              Provider Accounts
            </CardTitle>

            <CardDescription>
              View and manage all registered healthcare
              providers.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search by name, email, Work ID, or specialization..."
                className="pl-9"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <p className="text-sm text-destructive">
                  {error}
                </p>
              </div>
            )}

            {loading ? (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Loading providers...
                </p>
              </div>
            ) : filteredProviders.length === 0 ? (
              <div className="rounded-lg border border-dashed p-12 text-center">
                <p className="font-medium">
                  No providers found
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  {search
                    ? "Try a different search."
                    : "No healthcare provider accounts have been created yet."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">
                        Provider
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Role
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Work ID
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Specialization
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Status
                      </th>

                      <th className="px-4 py-3 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredProviders.map(
                      (provider) => (
                        <tr
                          key={provider.id}
                          className="border-b last:border-0"
                        >
                          <td className="px-4 py-4">
                            <div>
                              <p className="font-medium">
                                {provider.firstName}{" "}
                                {provider.lastName}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                {provider.email}
                              </p>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            {getProviderRoleLabel(
                              provider.role,
                            )}
                          </td>

                          <td className="px-4 py-4">
                            {provider.workId ?? "—"}
                          </td>

                          <td className="px-4 py-4">
                            {provider.specialization ??
                              "—"}
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={[
                                "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                                provider.status ===
                                "ACTIVE"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-muted text-muted-foreground",
                              ].join(" ")}
                            >
                              {provider.status ===
                              "ACTIVE"
                                ? "Active"
                                : "Inactive"}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="View provider"
                                aria-label="View provider"
                                onClick={() =>
                                  navigate(
                                    `/app/providers/${provider.id}`,
                                  )
                                }
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                title="Edit provider"
                                aria-label="Edit provider"
                                onClick={() =>
                                  navigate(
                                    `/app/providers/${provider.id}/edit`,
                                  )
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                title={
                                  provider.status ===
                                  "ACTIVE"
                                    ? "Deactivate provider"
                                    : "Activate provider"
                                }
                                aria-label={
                                  provider.status ===
                                  "ACTIVE"
                                    ? "Deactivate provider"
                                    : "Activate provider"
                                }
                                disabled={
                                  updatingId ===
                                  provider.id
                                }
                                onClick={() =>
                                  void handleStatusChange(
                                    provider,
                                  )
                                }
                              >
                                {provider.status ===
                                "ACTIVE" ? (
                                  <UserX className="h-4 w-4" />
                                ) : (
                                  <UserCheck className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {!loading &&
              providers.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Showing{" "}
                  {filteredProviders.length} of{" "}
                  {providers.length} providers
                </p>
              )}
          </CardContent>
        </Card>
      </div>

      <CreateProviderDialog
        open={createDialogOpen}
        onClose={() =>
          setCreateDialogOpen(false)
        }
        onCreated={() => {
          void loadProviders();
        }}
      />
    </>
  );
}