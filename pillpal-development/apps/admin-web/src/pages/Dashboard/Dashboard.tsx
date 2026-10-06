import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateProviderDialog } from "@/components/providers/CreateProviderDialog";

type DashboardStats = {
  totalProviders: number;
  totalDoctors: number;
  totalStaff: number;
  activeProviders: number;
  inactiveProviders: number;
  unreadNotificationsCount: number;
};

type ActivityLogItem = {
  id: string;
  action: string;
  details: string;
  createdAt: string;
  admin?: {
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

export function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalProviders: 0,
    totalDoctors: 0,
    totalStaff: 0,
    activeProviders: 0,
    inactiveProviders: 0,
    unreadNotificationsCount: 0,
  });
  const [recentActivities, setRecentActivities] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  async function loadDashboardData(isManual = false) {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetchWithAuth("/dashboard");

      if (response.status === 401 || response.status === 403) {
        navigate("/login");
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load dashboard data");
      }

      const data = await response.json();
      setStats(data.stats);
      setRecentActivities(data.recentActivities || []);
    } catch {
      setError("Unable to connect to the PILLPAL API server.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadDashboardData();
  }, []);

  function formatTimeAgo(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  }

  function getActionBadge(action: string) {
    switch (action) {
      case "PROVIDER_INVITED":
        return <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">Invited</span>;
      case "PROVIDER_ACTIVATED":
        return <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Activated</span>;
      case "PROVIDER_DEACTIVATED":
        return <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Deactivated</span>;
      case "PROVIDER_UPDATED":
        return <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">Updated</span>;
      default:
        return <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Audit</span>;
    }
  }

  const doctorPercentage =
    stats.totalProviders > 0
      ? Math.round((stats.totalDoctors / stats.totalProviders) * 100)
      : 0;

  const staffPercentage =
    stats.totalProviders > 0
      ? Math.round((stats.totalStaff / stats.totalProviders) * 100)
      : 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* -------------------------------------------------- */}
      {/* 1. TOP GREETING BANNER */}
      {/* -------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          {/* Tag */}
          <div className="inline-flex items-center rounded-md bg-[#e0f2fe] px-2.5 py-1 text-xs font-semibold text-[#0284c7]">
            Health services overview
          </div>

          {/* Heading */}
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Welcome back, <span className="text-[#0284c7]">Admin</span>
          </h1>

          {/* Subtitle */}
          <p className="text-sm text-slate-500 font-normal">
            Here's what's happening with your clinic and provider network today.
          </p>
        </div>

        {/* Status Pill & Action Buttons */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3.5 py-1.5 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-slate-700">Clinic active</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadDashboardData(true)}
            disabled={refreshing || loading}
            className="rounded-xl border-slate-200 bg-white shadow-2xs h-9 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-sm h-9 text-xs gap-1.5 font-semibold"
          >
            <Plus className="h-4 w-4" />
            Invite Provider
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* 2. STAT KPI CARDS (With Skeletons) */}
      {/* -------------------------------------------------- */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-100 bg-white p-6 shadow-2xs space-y-3"
            >
              <div className="flex items-start justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-11 w-11 rounded-2xl" />
              </div>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))
        ) : (
          <>
            {/* Card 1: Total Providers */}
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-2xs transition-all hover:shadow-sm">
              <div className="flex items-start justify-between">
                <span className="text-sm font-medium text-slate-500">
                  Total Providers
                </span>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e0f2fe] text-[#0284c7]">
                  <Users className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-2 text-3xl font-extrabold text-slate-900 tracking-tight">
                {stats.totalProviders}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {stats.activeProviders} active accounts
              </p>
            </div>

            {/* Card 2: Doctors */}
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-2xs transition-all hover:shadow-sm">
              <div className="flex items-start justify-between">
                <span className="text-sm font-medium text-slate-500">
                  Licensed Doctors
                </span>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ecfdf5] text-[#10b981]">
                  <Stethoscope className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-2 text-3xl font-extrabold text-slate-900 tracking-tight">
                {stats.totalDoctors}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Prescribing physicians
              </p>
            </div>

            {/* Card 3: Health Staff */}
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-2xs transition-all hover:shadow-sm">
              <div className="flex items-start justify-between">
                <span className="text-sm font-medium text-slate-500">
                  Health Staff
                </span>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#3b82f6]">
                  <UserCheck className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-2 text-3xl font-extrabold text-slate-900 tracking-tight">
                {stats.totalStaff}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Clinic nurses & officers
              </p>
            </div>

            {/* Card 4: System Status */}
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-2xs transition-all hover:shadow-sm">
              <div className="flex items-start justify-between">
                <span className="text-sm font-medium text-slate-500">
                  System Health
                </span>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#faf5ff] text-[#a855f7]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-2 text-3xl font-extrabold text-slate-900 tracking-tight">
                100%
              </div>
              <p className="mt-1 text-xs text-slate-400">
                All clinical services online
              </p>
            </div>
          </>
        )}
      </div>

      {/* -------------------------------------------------- */}
      {/* 3. MAIN SECTION (With Skeletons) */}
      {/* -------------------------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Card: Provider Overview (2 Cols) */}
        <div className="rounded-3xl border border-slate-100 bg-white p-7 shadow-2xs lg:col-span-2 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Provider Overview
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 font-normal">
                Current clinical account activity across your clinic network.
              </p>
            </div>

            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e0f2fe] text-[#0284c7]">
              <TrendingUp className="h-4.5 w-4.5" />
            </div>
          </div>

          {/* Sub Cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {loading ? (
              <>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Skeleton className="h-9 w-9 rounded-xl" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-10" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Skeleton className="h-9 w-9 rounded-xl" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-10" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              </>
            ) : (
              <>
                {/* Box A: Amber Box */}
                <div className="rounded-2xl border border-[#fef3c7] bg-[#fffbeb] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                        <Clock className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 leading-tight">
                          Active Doctors
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Licensed physicians
                        </p>
                      </div>
                    </div>

                    <span className="text-2xl font-extrabold text-slate-900">
                      {stats.totalDoctors}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                      <span>Share of network</span>
                      <span className="font-bold text-slate-700">{doctorPercentage}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-amber-200/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all duration-500"
                        style={{ width: `${doctorPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Box B: Emerald Box */}
                <div className="rounded-2xl border border-[#d1fae5] bg-[#ecfdf5] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                        <CheckCircle2 className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 leading-tight">
                          Health Staff
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Support officers & nurses
                        </p>
                      </div>
                    </div>

                    <span className="text-2xl font-extrabold text-slate-900">
                      {stats.totalStaff}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                      <span>Share of network</span>
                      <span className="font-bold text-slate-700">{staffPercentage}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-emerald-200/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${staffPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Recent Activity Feed */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                Recent Activity
              </h3>
              <Link
                to="/app/activity-log"
                className="text-xs font-semibold text-[#0284c7] hover:underline"
              >
                View all
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-16 rounded-md" />
                      <Skeleton className="h-4 w-52" />
                    </div>
                    <Skeleton className="h-3 w-14" />
                  </div>
                ))}
              </div>
            ) : recentActivities.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No recent activity events recorded.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentActivities.slice(0, 4).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 pr-4">
                      {getActionBadge(activity.action)}
                      <p className="text-xs font-medium text-slate-800 line-clamp-1">
                        {activity.details}
                      </p>
                    </div>

                    <span className="text-[11px] text-slate-400 shrink-0">
                      {formatTimeAgo(activity.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Card: Clinic Summary (1 Col) */}
        <div className="rounded-3xl border border-slate-100 bg-white p-7 shadow-2xs space-y-6">
          {/* Header */}
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Clinic Summary
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 font-normal">
              A quick look at your health network.
            </p>
          </div>

          {/* Summary Items List */}
          <div className="space-y-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between p-2">
                  <div className="flex items-center gap-3.5">
                    <Skeleton className="h-10 w-10 rounded-2xl" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="h-6 w-8" />
                </div>
              ))
            ) : (
              <>
                {/* Row 1: Doctors */}
                <div className="flex items-center justify-between p-2 rounded-2xl hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#3b82f6]">
                      <Stethoscope className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-semibold text-slate-800">
                      Doctors
                    </span>
                  </div>
                  <span className="text-base font-extrabold text-slate-900">
                    {stats.totalDoctors}
                  </span>
                </div>

                {/* Row 2: Health Staff */}
                <div className="flex items-center justify-between p-2 rounded-2xl hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#faf5ff] text-[#a855f7]">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-semibold text-slate-800">
                      Health Staff
                    </span>
                  </div>
                  <span className="text-base font-extrabold text-slate-900">
                    {stats.totalStaff}
                  </span>
                </div>

                {/* Row 3: Total Accounts */}
                <div className="flex items-center justify-between p-2 rounded-2xl hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#e0f2fe] text-[#0284c7]">
                      <Users className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-semibold text-slate-800">
                      Total Providers
                    </span>
                  </div>
                  <span className="text-base font-extrabold text-slate-900">
                    {stats.totalProviders}
                  </span>
                </div>

                {/* Row 4: Unread Notifications */}
                <div className="flex items-center justify-between p-2 rounded-2xl hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fffbeb] text-amber-600">
                      <Bell className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-semibold text-slate-800">
                      System Alerts
                    </span>
                  </div>
                  <span className="text-base font-extrabold text-slate-900">
                    {stats.unreadNotificationsCount}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Quick Operations Button */}
          <div className="pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              onClick={() => navigate("/app/providers")}
              className="w-full justify-between rounded-xl border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <span>Manage Provider Directory</span>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </Button>
          </div>
        </div>
      </div>

      <CreateProviderDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={() => loadDashboardData()}
      />
    </div>
  );
}