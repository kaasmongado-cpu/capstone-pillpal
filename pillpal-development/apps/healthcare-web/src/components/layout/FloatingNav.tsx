import {
  Activity,
  Boxes,
  CalendarDays,
  LayoutDashboard,
  Pill,
  Users,
} from "lucide-react";
import { NavLink } from "react-router-dom";

export function FloatingNav() {
  const items = [
    { label: "Dashboard", path: "/app/dashboard", icon: LayoutDashboard },
    { label: "Patients", path: "/app/patients", icon: Users },
    { label: "Stock", path: "/app/inventory", icon: Boxes },
    { label: "Meds", path: "/app/medications", icon: Pill },
    { label: "Adherence", path: "/app/adherence", icon: Activity },
    { label: "Appts", path: "/app/appointments", icon: CalendarDays },
  ];

  return (
    <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center px-4 lg:hidden pointer-events-none">
      <nav
        aria-label="Mobile Navigation"
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/95 px-3 py-2 shadow-xl backdrop-blur-md"
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                [
                  "flex flex-col items-center justify-center rounded-full px-2.5 py-1.5 text-[10px] font-semibold transition-all duration-150",
                  isActive
                    ? "bg-[#0284c7] text-white shadow-2xs"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100",
                ].join(" ")
              }
            >
              <Icon className="h-4 w-4" />
              <span className="mt-0.5 scale-90">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
