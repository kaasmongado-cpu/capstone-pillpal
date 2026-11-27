import {
  Activity,
  Calendar,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Pill,
  User,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

interface FloatingNavProps {
  isCollapsed?: boolean;
  unreadMessagesCount?: number;
  onOpenMobileMenu?: () => void;
}

export function FloatingNav({
  isCollapsed = false,
  unreadMessagesCount = 0,
  onOpenMobileMenu,
}: FloatingNavProps) {
  const location = useLocation();

  const navItems = [
    {
      label: "Dashboard",
      shortLabel: "Home",
      path: "/app/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Medications",
      shortLabel: "Meds",
      path: "/app/medications",
      icon: Pill,
    },
    {
      label: "Adherence",
      shortLabel: "Tracker",
      path: "/app/adherence",
      icon: Activity,
    },
    {
      label: "Appointments",
      shortLabel: "Visits",
      path: "/app/appointments",
      icon: Calendar,
    },
    {
      label: "Messages",
      shortLabel: "Chat",
      path: "/app/messages",
      icon: MessageSquare,
      badge: unreadMessagesCount,
    },
  ];

  // On desktop: shown only when sidebar is collapsed.
  // On mobile (< lg): always rendered as a floating dock.
  return (
    <nav
      aria-label="Floating Navigation Dock"
      className={`fixed bottom-4 inset-x-3 mx-auto z-40 w-fit max-w-[95vw] transition-all duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-3 ${
        isCollapsed ? "flex" : "flex lg:hidden"
      }`}
    >
      <div className="flex items-center gap-1 sm:gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-2xl backdrop-blur-xl ring-1 ring-black/5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            location.pathname === item.path ||
            (item.path !== "/app/dashboard" && location.pathname.startsWith(item.path));

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`relative flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 transition-all duration-200 ${
                isActive
                  ? "bg-emerald-600 text-white shadow-xs font-semibold scale-105"
                  : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95"
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                {item.badge && item.badge > 0 ? (
                  <span
                    className={`absolute -top-1.5 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[8px] font-bold leading-none ${
                      isActive
                        ? "bg-white text-emerald-700"
                        : "bg-emerald-600 text-white"
                    }`}
                  >
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </div>
              <span className="hidden sm:inline text-[11px] tracking-tight">
                {item.label}
              </span>
              <span className="sm:hidden text-[11px] tracking-tight">
                {item.shortLabel}
              </span>
            </NavLink>
          );
        })}

        {/* Desktop Profile Shortcut when Collapsed */}
        {isCollapsed && (
          <div className="hidden lg:flex items-center gap-0.5 pl-0.5 border-l border-slate-200/80 ml-0.5">
            <NavLink
              to="/app/profile"
              title="Profile & Health ID"
              className={({ isActive }) =>
                `flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                  isActive
                    ? "bg-emerald-600 text-white"
                    : "text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                }`
              }
            >
              <User className="h-4 w-4" />
            </NavLink>
          </div>
        )}

        {/* Mobile More / Menu Button */}
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open Full Navigation Drawer"
            className="flex lg:hidden items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 active:scale-95"
          >
            <Menu className="h-4.5 w-4.5" />
            <span className="text-[11px] tracking-tight">More</span>
          </button>
        )}
      </div>
    </nav>
  );
}
