import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Pill,
  Calendar,
  MessageSquare,
  User,
  LogOut,
  HeartPulse,
  PhoneCall,
  Activity,
  ShieldCheck,
} from "lucide-react";
import { signOut } from "@pillpal/auth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    name: "Dashboard",
    path: "/app/dashboard",
    icon: LayoutDashboard,
    description: "Today's doses & overview",
  },
  {
    name: "My Medications",
    path: "/app/medications",
    icon: Pill,
    description: "Prescriptions & schedules",
  },
  {
    name: "Adherence Tracker",
    path: "/app/adherence",
    icon: Activity,
    description: "Intake stats & streaks",
  },
  {
    name: "Appointments",
    path: "/app/appointments",
    icon: Calendar,
    description: "Clinic visits & telehealth",
  },
  {
    name: "Messages",
    path: "/app/messages",
    icon: MessageSquare,
    description: "Chat with clinic doctors",
  },
  {
    name: "Profile & Health ID",
    path: "/app/profile",
    icon: User,
    description: "Medical profile & records",
  },
];

interface SidebarProps {
  patientName?: string;
  idNumber?: string;
  department?: string;
  allergies?: string | null;
  bloodType?: string | null;
  onCloseMobile?: () => void;
}

export function Sidebar({
  patientName = "CSU Patient",
  idNumber = "2022-04912",
  department = "College of Nursing",
  allergies = "No Known Drug Allergies (NKA)",
  bloodType = "O+",
  onCloseMobile,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  return (
    <aside className="flex h-full w-64 flex-col justify-between border-r border-slate-200/80 bg-white p-4 select-none">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 pt-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black tracking-tight text-slate-900">
                PILLPAL
              </span>
              <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                PATIENT
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-400">CSU Health Portal</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Health Management
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path !== "/app/dashboard" && location.pathname.startsWith(item.path));

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onCloseMobile}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all",
                  isActive
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20"
                    : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isActive ? "text-white" : "text-slate-400 group-hover:text-emerald-600"
                  )}
                />
                <div className="flex flex-col">
                  <span>{item.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3 pt-4">
        {/* Emergency Medical Quick Card */}
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase text-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Health Card
            </span>
            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-black text-emerald-700 shadow-2xs">
              {bloodType || "O+"}
            </span>
          </div>

          <div className="mt-2 space-y-1">
            <p className="font-bold text-slate-900 truncate">{patientName}</p>
            <p className="font-mono text-[10px] text-slate-500">{idNumber}</p>
            <p className="text-[10px] text-slate-500 truncate">{department}</p>
          </div>

          <div className="mt-2.5 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Allergies:</span>
            <span className="font-bold text-red-600 truncate max-w-[110px]" title={allergies || "NKA"}>
              {allergies || "NKA"}
            </span>
          </div>
        </div>

        {/* CSU Clinic Support Info */}
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-[11px] text-slate-500">
          <PhoneCall className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <div className="truncate">
            <span className="font-bold text-slate-700">CSU Clinic: </span>
            <span>(085) 341-2786</span>
          </div>
        </div>

        {/* Logout Button */}
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
