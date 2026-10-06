import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Clock,
  Filter,
  RefreshCw,
  Search,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type ActivityLogItem = {
  id: string;
  adminId: string | null;
  action: string;
  details: string;
  targetId: string | null;
  targetType: string | null;
  createdAt: string;
  admin?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  } | null;
};

export function ActivityLog() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<string>("ALL");
  const [error, setError] = useState("");

  async function loadLogs(isManual = false) {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetchWithAuth("/activity-logs?limit=100");

      if (response.status === 401 || response.status === 403) {
        navigate("/login");
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load activity logs.");
      }

      const data = await response.json();
      setLogs(data.logs || []);
    } catch {
      setError("Unable to connect to the server to fetch activity logs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch =
        log.details.toLowerCase().includes(search.toLowerCase()) ||
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        (log.admin?.email && log.admin.email.toLowerCase().includes(search.toLowerCase())) ||
        (log.admin?.firstName && log.admin.firstName.toLowerCase().includes(search.toLowerCase()));

      const matchesAction =
        filterAction === "ALL" || log.action === filterAction;

      return matchesSearch && matchesAction;
    });
  }, [logs, search, filterAction]);

  function getActionBadge(action: string) {
    switch (action) {
      case "PROVIDER_INVITED":
        return (
          <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10">
            Provider Invited
          </span>
        );
      case "PROVIDER_ACTIVATED":
        return (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            Provider Activated
          </span>
        );
      case "PROVIDER_DEACTIVATED":
        return (
          <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
            Provider Deactivated
          </span>
        );
      case "PROVIDER_UPDATED":
        return (
          <span className="inline-flex items-center rounded-md bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-700/10">
            Provider Updated
          </span>
        );
      case "ADMIN_SETUP_COMPLETED":
        return (
          <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
            Setup Completed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-800">
            {action}
          </span>
        );
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Activity Log
          </h1>
          <p className="text-sm text-muted-foreground">
            Audit trail of administrative actions, account updates, and system events.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => loadLogs(true)}
          disabled={refreshing}
          className="gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh Log
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search activity details or administrator..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ALL">All Actions</option>
                <option value="PROVIDER_INVITED">Provider Invited</option>
                <option value="PROVIDER_ACTIVATED">Provider Activated</option>
                <option value="PROVIDER_DEACTIVATED">Provider Deactivated</option>
                <option value="PROVIDER_UPDATED">Provider Updated</option>
                <option value="ADMIN_SETUP_COMPLETED">Admin Setup</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Feed */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">System Events ({filteredLogs.length})</CardTitle>
          <CardDescription>
            Chronological audit log recorded across management sessions.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-24 rounded-md" />
                      <Skeleton className="h-4 w-36" />
                    </div>
                    <Skeleton className="h-4 w-72" />
                  </div>
                  <Skeleton className="h-3.5 w-28" />
                </div>
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center">
              <Activity className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">No activity records found</p>
              <p className="text-xs text-muted-foreground">
                {search || filterAction !== "ALL"
                  ? "Try adjusting your search query or action filter."
                  : "Administrative actions performed in PILLPAL will be logged here."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="space-y-1 sm:max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      {getActionBadge(log.action)}
                      {log.admin && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          {log.admin.firstName} {log.admin.lastName} ({log.admin.email})
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-medium text-foreground">
                      {log.details}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground sm:self-center">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatDate(log.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
