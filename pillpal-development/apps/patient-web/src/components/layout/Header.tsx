import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Menu,
  PanelLeft,
  PanelLeftOpen,
  AlertTriangle,
  Bell,
  Pill,
  Calendar,
  MessageSquare,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PatientAlerts {
  unreadMessages: number;
  pendingDoses: number;
  upcomingAppointments: number;
}

interface HeaderProps {
  patientName?: string;
  idNumber?: string;
  department?: string;
  alerts?: PatientAlerts;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenMobileSidebar?: () => void;
}

export function Header({
  patientName = "Patient",
  idNumber = "",
  department = "",
  alerts = { unreadMessages: 0, pendingDoses: 0, upcomingAppointments: 0 },
  isCollapsed = false,
  onToggleCollapse,
  onOpenMobileSidebar,
}: HeaderProps) {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const totalAlerts =
    alerts.unreadMessages + alerts.pendingDoses + alerts.upcomingAppointments;

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAlertsOpen(false);
      }
    }
    if (alertsOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [alertsOpen]);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={isCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
            aria-label="Toggle Sidebar"
            className="hidden lg:flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4 text-emerald-600" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation drawer"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden cursor-pointer"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-black text-slate-900">
              Welcome back, {patientName.split(" ")[0]}!
            </h1>
            <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
              Active Patient
            </span>
          </div>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Track your medications, log daily doses, and stay connected with CSU Clinic.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* CSU ID & Department Tag */}
        <div className="hidden md:flex flex-col text-right">
          <span className="font-mono text-xs font-bold text-slate-800">{idNumber}</span>
          <span className="text-[10px] text-slate-400">{department}</span>
        </div>

        {/* Emergency Help Action */}
        <a href="tel:0853412786" className="hidden sm:block">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-xl border-red-200 bg-red-50/60 text-red-700 hover:bg-red-100 text-xs font-bold cursor-pointer"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
            <span className="hidden lg:inline">CSU Clinic Emergency</span>
            <span className="lg:hidden">Emergency</span>
          </Button>
        </a>

        {/* Patient Alerts Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setAlertsOpen((o) => !o)}
            aria-label="Patient health alerts"
            className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <Bell className="h-4 w-4" />
            {totalAlerts > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-black text-white">
                {totalAlerts > 9 ? "9+" : totalAlerts}
              </span>
            )}
          </button>

          {alertsOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl z-40 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-black text-slate-900">Health Alerts</span>
                <span className="text-[10px] font-bold text-slate-400">
                  {totalAlerts} active
                </span>
              </div>

              {totalAlerts === 0 ? (
                <div className="py-5 text-center space-y-1">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">You&apos;re all caught up!</p>
                  <p className="text-[11px] text-slate-400">
                    No pending doses or unread clinic replies.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {alerts.pendingDoses > 0 && (
                    <Link
                      to="/app/dashboard"
                      onClick={() => setAlertsOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-emerald-50 transition-colors"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <Pill className="h-4 w-4" />
                      </div>
                      <div className="text-xs">
                        <p className="font-bold text-slate-900">
                          {alerts.pendingDoses} Pending Dose
                          {alerts.pendingDoses === 1 ? "" : "s"} Today
                        </p>
                        <p className="text-[10px] text-slate-500">Tap to log your intake</p>
                      </div>
                    </Link>
                  )}

                  {alerts.upcomingAppointments > 0 && (
                    <Link
                      to="/app/appointments"
                      onClick={() => setAlertsOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-sky-50 transition-colors"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-[#0284c7]">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div className="text-xs">
                        <p className="font-bold text-slate-900">
                          {alerts.upcomingAppointments} Active Clinic Visit
                          {alerts.upcomingAppointments === 1 ? "" : "s"}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          View schedule or check in
                        </p>
                      </div>
                    </Link>
                  )}

                  {alerts.unreadMessages > 0 && (
                    <Link
                      to="/app/messages"
                      onClick={() => setAlertsOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-amber-50 transition-colors"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <div className="text-xs">
                        <p className="font-bold text-slate-900">
                          {alerts.unreadMessages} Unread Clinician Message
                          {alerts.unreadMessages === 1 ? "" : "s"}
                        </p>
                        <p className="text-[10px] text-slate-500">Open CSU Health Desk</p>
                      </div>
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Profile Avatar */}
        <Link
          to="/app/profile"
          title="View Patient Profile & Health ID"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-xs hover:bg-emerald-700 transition-colors"
        >
          {patientName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </Link>
      </div>
    </header>
  );
}
