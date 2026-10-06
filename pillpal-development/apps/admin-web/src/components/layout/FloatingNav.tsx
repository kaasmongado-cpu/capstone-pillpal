import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  LayoutDashboard,
  Menu,
  PanelLeftOpen,
  Settings,
  User,
  Users,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { fetchWithAuth } from "@/lib/api";

type FloatingNavProps = {
  isCollapsed?: boolean;
  onExpandSidebar?: () => void;
  onOpenMobileMenu?: () => void;
};

export function FloatingNav({
  isCollapsed = false,
  onExpandSidebar,
  onOpenMobileMenu,
}: FloatingNavProps) {
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    async function checkNotifications() {
      try {
        const response = await fetchWithAuth("/notifications?limit=5");
        if (response.ok) {
          const data = await response.json();
          setUnreadCount(data.unreadCount || 0);
        }
      } catch {
        // silent fail
      }
    }
    void checkNotifications();
  }, [location.pathname]);

  const navItems = [
    {
      label: "Dashboard",
      path: "/app/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Providers",
      path: "/app/providers",
      icon: Users,
    },
    {
      label: "Activity",
      path: "/app/activity-log",
      icon: Activity,
    },
    {
      label: "Alerts",
      path: "/app/notifications",
      icon: Bell,
      badge: unreadCount,
    },
  ];

  // If on desktop and sidebar is NOT collapsed, do not render floating nav
  // On mobile (lg:hidden), floating nav is ALWAYS rendered
  return (
    <nav
      aria-label="Floating Navigation Dock"
      className={`fixed bottom-4 inset-x-3 mx-auto z-40 w-fit max-w-lg transition-all duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-3 ${
        isCollapsed ? "flex" : "flex lg:hidden"
      }`}
    >
      <div className="flex items-center gap-1 sm:gap-1.5 rounded-2xl border border-border/80 bg-background/90 p-1.5 shadow-2xl backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/10">
        {/* Desktop Expand Button (Shown on desktop when collapsed) */}
        {isCollapsed && onExpandSidebar && (
          <button
            type="button"
            onClick={onExpandSidebar}
            title="Expand Full Sidebar (Ctrl+B)"
            aria-label="Expand Full Sidebar"
            className="hidden lg:flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all duration-150 active:scale-95"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PanelLeftOpen className="h-4 w-4" />
            </div>
            <span className="text-[11px]">Sidebar</span>
          </button>
        )}

        {/* Separator on desktop when collapsed */}
        {isCollapsed && onExpandSidebar && (
          <div className="hidden lg:block h-6 w-px bg-border/60 mx-0.5" />
        )}

        {/* Core Nav Items */}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition-all duration-200 ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-xs font-semibold scale-105"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground active:scale-95"
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                {item.badge && item.badge > 0 ? (
                  <span
                    className={`absolute -top-1.5 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[8px] font-bold leading-none ${
                      isActive
                        ? "bg-background text-primary"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[11px] tracking-tight">{item.label}</span>
            </NavLink>
          );
        })}

        {/* Desktop Quick Shortcuts when Collapsed */}
        {isCollapsed && (
          <div className="hidden lg:flex items-center gap-0.5">
            <NavLink
              to="/app/settings"
              title="System Settings"
              className={({ isActive }) =>
                `flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                }`
              }
            >
              <Settings className="h-4 w-4" />
            </NavLink>

            <NavLink
              to="/app/profile"
              title="Admin Profile"
              className={({ isActive }) =>
                `flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
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
            className="flex lg:hidden items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-muted-foreground transition-all duration-200 hover:bg-muted/70 hover:text-foreground active:scale-95"
          >
            <Menu className="h-4.5 w-4.5" />
            <span className="text-[11px] tracking-tight">More</span>
          </button>
        )}
      </div>
    </nav>
  );
}
