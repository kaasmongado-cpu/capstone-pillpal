import { useEffect, useState } from "react";
import {
  Activity,
  Boxes,
  CalendarDays,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Pill,
  Settings,
  User,
  Users,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { fetchWithAuth } from "@/lib/api";

type FloatingNavProps = {
  isCollapsed?: boolean;
  onOpenMobileMenu?: () => void;
};

export function FloatingNav({
  isCollapsed = false,
  onOpenMobileMenu,
}: FloatingNavProps) {
  const location = useLocation();
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    async function checkUnreadMessages() {
      try {
        const response = await fetchWithAuth("/messages/conversations");
        if (response.ok) {
          const conversations = await response.json();
          if (Array.isArray(conversations)) {
            const total = conversations.reduce(
              (sum: number, c: any) => sum + (Number(c.unreadCount) || 0),
              0,
            );
            setUnreadMessages(total);
          }
        }
      } catch {
        // silent fail
      }
    }

    void checkUnreadMessages();
    const handleRefresh = () => {
      void checkUnreadMessages();
    };
    window.addEventListener("pillpal:messages-updated", handleRefresh);
    return () => {
      window.removeEventListener("pillpal:messages-updated", handleRefresh);
    };
  }, [location.pathname]);

  const navItems = [
    {
      label: "Dashboard",
      shortLabel: "Home",
      path: "/app/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Patients",
      shortLabel: "Patients",
      path: "/app/patients",
      icon: Users,
    },
    {
      label: "Inventory",
      shortLabel: "Stock",
      path: "/app/inventory",
      icon: Boxes,
    },
    {
      label: "Medications",
      shortLabel: "Meds",
      path: "/app/medications",
      icon: Pill,
    },
    {
      label: "Adherence",
      shortLabel: "Adherence",
      path: "/app/adherence",
      icon: Activity,
      hideOnMobile: true,
    },
    {
      label: "Appointments",
      shortLabel: "Appts",
      path: "/app/appointments",
      icon: CalendarDays,
    },
    {
      label: "Messages",
      shortLabel: "Chat",
      path: "/app/messages",
      icon: MessageSquare,
      badge: unreadMessages,
      hideOnMobile: true,
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
        {/* Core Clinical Nav Items */}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`relative items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 transition-all duration-200 ${
                item.hideOnMobile ? "hidden md:flex" : "flex"
              } ${
                isActive
                  ? "bg-[#0284c7] text-white shadow-xs font-semibold scale-105"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:scale-95"
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                {item.badge && item.badge > 0 ? (
                  <span
                    className={`absolute -top-1.5 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[8px] font-bold leading-none ${
                      isActive
                        ? "bg-white text-[#0284c7]"
                        : "bg-[#0284c7] text-white"
                    }`}
                  >
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </div>
              <span className="hidden xl:inline text-[11px] tracking-tight">
                {item.label}
              </span>
              <span className="xl:hidden text-[11px] tracking-tight">
                {item.shortLabel}
              </span>
            </NavLink>
          );
        })}

        {/* Desktop Quick Shortcuts when Collapsed */}
        {isCollapsed && (
          <div className="hidden lg:flex items-center gap-0.5 pl-0.5 border-l border-slate-200/80 ml-0.5">
            <NavLink
              to="/app/settings"
              title="Settings"
              className={({ isActive }) =>
                `flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                  isActive
                    ? "bg-[#0284c7] text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              <Settings className="h-4 w-4" />
            </NavLink>

            <NavLink
              to="/app/profile"
              title="Profile"
              className={({ isActive }) =>
                `flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                  isActive
                    ? "bg-[#0284c7] text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
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
