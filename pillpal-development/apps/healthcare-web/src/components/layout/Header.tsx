import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronDown,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeft,
  PanelLeftOpen,
  Settings,
  Shield,
  Stethoscope,
  User,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { getSession, signOut } from "@pillpal/auth";
import { fetchWithAuth } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type HeaderProps = {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenSidebar?: () => void;
};

type ClinicalAlertCounts = {
  unreadMessages: number;
  pendingTriage: number;
  stockAlerts: number;
  attentionPatients: number;
};

export function Header({
  isCollapsed = false,
  onToggleCollapse,
  onOpenSidebar,
}: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [alerts, setAlerts] = useState<ClinicalAlertCounts>({
    unreadMessages: 0,
    pendingTriage: 0,
    stockAlerts: 0,
    attentionPatients: 0,
  });
  const [providerName, setProviderName] = useState("");
  const [providerEmail, setProviderEmail] = useState("");
  const [providerRole, setProviderRole] = useState<"DOCTOR" | "HEALTH_STAFF">("DOCTOR");
  const [specialization, setSpecialization] = useState("");

  useEffect(() => {
    async function loadUserData() {
      try {
        const {
          data: { session },
        } = await getSession();
        if (session?.user?.email) {
          setProviderEmail(session.user.email);
        }

        const [meRes, convoRes, dashRes] = await Promise.all([
          fetchWithAuth("/me"),
          fetchWithAuth("/messages/conversations"),
          fetchWithAuth("/clinical-dashboard"),
        ]);

        if (meRes.ok) {
          const user = await meRes.json();
          if (user.firstName || user.lastName) {
            setProviderName(
              `${user.role === "DOCTOR" ? "Dr. " : ""}${user.firstName || ""} ${user.lastName || ""}`.trim(),
            );
          }
          if (user.email) {
            setProviderEmail(user.email);
          }
          if (user.role) {
            setProviderRole(user.role);
          }
          setSpecialization(user.specialization || "");
        }

        let unreadMessages = 0;
        if (convoRes.ok) {
          const convos = await convoRes.json();
          if (Array.isArray(convos)) {
            unreadMessages = convos.reduce(
              (acc: number, c: any) => acc + Number(c?.unreadCount || 0),
              0,
            );
          }
        }

        let pendingTriage = 0;
        let stockAlerts = 0;
        let attentionPatients = 0;
        if (dashRes.ok) {
          const dash = await dashRes.json();
          pendingTriage = Number(dash?.stats?.pendingTriageCount || 0);
          stockAlerts =
            Number(dash?.stats?.lowStockCount || 0) +
            Number(dash?.stats?.outOfStockCount || 0);
          attentionPatients = Number(dash?.stats?.criticalAttentionCount || 0);
        }

        setAlerts({
          unreadMessages,
          pendingTriage,
          stockAlerts,
          attentionPatients,
        });
      } catch {
        // silent fail
      }
    }

    void loadUserData();
    const handleRefresh = () => {
      void loadUserData();
    };
    window.addEventListener("pillpal:profile-updated", handleRefresh);
    window.addEventListener("pillpal:messages-updated", handleRefresh);
    return () => {
      window.removeEventListener("pillpal:profile-updated", handleRefresh);
      window.removeEventListener("pillpal:messages-updated", handleRefresh);
    };
  }, [location.pathname]);

  async function handleSignOut() {
    try {
      await signOut();
      navigate("/login");
    } catch {
      navigate("/login");
    }
  }

  const totalAlerts =
    alerts.unreadMessages +
    alerts.pendingTriage +
    alerts.stockAlerts +
    alerts.attentionPatients;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-100 bg-white/95 px-6 backdrop-blur-xs transition-all duration-200">
      {/* Left: Collapse Toggle + Portal Logo + Healthcare Portal Header */}
      <div className="flex items-center gap-3">
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label="Toggle Sidebar"
            className="hidden lg:flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4 text-[#0284c7]" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </button>
        )}

        {onOpenSidebar && (
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Open navigation drawer"
            className="lg:hidden h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-2xs cursor-pointer"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-[#0284c7] border border-sky-100">
            <Stethoscope className="h-5 w-5 stroke-[2.2]" />
          </div>

          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 leading-tight">
              Healthcare Portal
            </h1>
            <p className="text-[11px] text-slate-400 font-normal">
              CSU University Center for Health and Wellness
            </p>
          </div>
        </div>
      </div>

      {/* Right: Clinician Role, Clinical Alerts Dropdown & Profile Dropdown */}
      <div className="flex items-center gap-4">
        <div className="hidden sm:block text-right">
          <p className="text-xs font-bold text-slate-800 leading-none">
            {providerName || "Clinician"}
          </p>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
            {providerRole === "DOCTOR"
              ? specialization
                ? `DOCTOR • ${specialization}`
                : "DOCTOR"
              : "HEALTH STAFF • CSU CLINIC"}
          </p>
        </div>

        {/* Clinical Alerts Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Clinical Alerts"
            className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer outline-none"
          >
            <Bell className="h-4.5 w-4.5" />
            {totalAlerts > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0284c7] px-1 text-[9px] font-black text-white">
                {totalAlerts > 99 ? "99+" : totalAlerts}
              </span>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            side="bottom"
            sideOffset={8}
            className="w-72 rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl"
          >
            <DropdownMenuLabel className="px-2.5 py-2 flex items-center justify-between">
              <span className="text-xs font-black text-slate-900">Clinical Alerts</span>
              <span className="text-[10px] font-bold text-slate-400">
                {totalAlerts} active
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-1 -mx-1.5 h-px bg-slate-100" />

            {totalAlerts === 0 ? (
              <div className="px-3 py-5 text-center space-y-1">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                <p className="text-xs font-bold text-slate-700">All caught up</p>
                <p className="text-[11px] text-slate-400">
                  No urgent clinical notifications right now.
                </p>
              </div>
            ) : (
              <>
                {alerts.unreadMessages > 0 && (
                  <DropdownMenuItem
                    onClick={() => navigate("/app/messages")}
                    className="cursor-pointer gap-2.5 px-2.5 py-2 text-xs text-slate-700"
                  >
                    <MessageSquare className="h-4 w-4 text-[#0284c7] shrink-0" />
                    <span className="flex-1">
                      <strong>{alerts.unreadMessages}</strong> unread patient message
                      {alerts.unreadMessages === 1 ? "" : "s"}
                    </span>
                  </DropdownMenuItem>
                )}

                {alerts.pendingTriage > 0 && (
                  <DropdownMenuItem
                    onClick={() => navigate("/app/appointments")}
                    className="cursor-pointer gap-2.5 px-2.5 py-2 text-xs text-slate-700"
                  >
                    <Calendar className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="flex-1">
                      <strong>{alerts.pendingTriage}</strong> appointment request
                      {alerts.pendingTriage === 1 ? "" : "s"} awaiting triage
                    </span>
                  </DropdownMenuItem>
                )}

                {alerts.stockAlerts > 0 && (
                  <DropdownMenuItem
                    onClick={() => navigate("/app/inventory")}
                    className="cursor-pointer gap-2.5 px-2.5 py-2 text-xs text-slate-700"
                  >
                    <Boxes className="h-4 w-4 text-rose-600 shrink-0" />
                    <span className="flex-1">
                      <strong>{alerts.stockAlerts}</strong> low / out-of-stock pharmacy item
                      {alerts.stockAlerts === 1 ? "" : "s"}
                    </span>
                  </DropdownMenuItem>
                )}

                {alerts.attentionPatients > 0 && (
                  <DropdownMenuItem
                    onClick={() => navigate("/app/adherence")}
                    className="cursor-pointer gap-2.5 px-2.5 py-2 text-xs text-slate-700"
                  >
                    <Activity className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="flex-1">
                      <strong>{alerts.attentionPatients}</strong> patient
                      {alerts.attentionPatients === 1 ? "" : "s"} needing adherence review
                    </span>
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7]/50"
            aria-label="Provider Profile Menu"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0284c7] text-xs font-bold text-white shadow-2xs">
              {(providerName[0] || providerEmail[0] || "C").toUpperCase()}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            side="bottom"
            sideOffset={8}
            className="w-60 rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl"
          >
            <DropdownMenuLabel className="px-2.5 py-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-[#0284c7]">
                  <Shield className="h-4 w-4" />
                </div>
                <div className="leading-tight min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {providerName || "Clinician"}
                  </p>
                  <p className="text-[10px] font-normal text-slate-400 truncate">
                    {providerEmail}
                  </p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-1 -mx-1.5 h-px bg-slate-100" />

            <DropdownMenuItem
              onClick={() => navigate("/app/profile")}
              className="cursor-pointer gap-2.5 px-2.5 py-2 text-xs text-slate-700"
            >
              <User className="h-4 w-4 text-slate-400" />
              <span>Provider Profile</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => navigate("/app/settings")}
              className="cursor-pointer gap-2.5 px-2.5 py-2 text-xs text-slate-700"
            >
              <Settings className="h-4 w-4 text-slate-400" />
              <span>Clinical Settings</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1 -mx-1.5 h-px bg-slate-100" />

            <DropdownMenuItem
              onClick={handleSignOut}
              variant="destructive"
              className="cursor-pointer gap-2.5 px-2.5 py-2 text-xs text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4 text-red-500" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
