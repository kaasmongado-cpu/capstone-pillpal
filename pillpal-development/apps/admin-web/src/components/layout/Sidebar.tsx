import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  Settings,
  Stethoscope,
  User,
  Users,
  X,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { getSession, signOut } from "@pillpal/auth";
import { fetchWithAuth } from "@/lib/api";

type NavigationItemType = {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  badge?: string | number;
};

type NavGroup = {
  title?: string;
  items: NavigationItemType[];
};

type SidebarProps = {
  isOpen?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
};

export function Sidebar({
  isOpen = false,
  isCollapsed = false,
  onToggleCollapse,
  onClose,
}: SidebarProps) {
  const navigate = useNavigate();
  const [adminEmail, setAdminEmail] = useState("admin@pillpal.csu.edu.ph");
  const [adminName, setAdminName] = useState("Administrator");
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    async function loadUser() {
      try {
        const {
          data: { session },
        } = await getSession();
        if (session?.user?.email) {
          setAdminEmail(session.user.email);
        }

        const meRes = await fetchWithAuth("/me");
        if (meRes.ok) {
          const user = await meRes.json();
          if (user.firstName && user.lastName) {
            setAdminName(`${user.firstName} ${user.lastName}`);
          }
        }

        const notifRes = await fetchWithAuth("/notifications?limit=5");
        if (notifRes.ok) {
          const notifData = await notifRes.json();
          setUnreadCount(notifData.unreadCount || 0);
        }
      } catch {
        // silent fail
      }
    }
    void loadUser();
  }, []);

  async function handleSignOut() {
    try {
      await signOut();
      navigate("/login");
    } catch {
      navigate("/login");
    }
  }

  function handleNavClick() {
    onClose?.();
  }

  const navGroups: NavGroup[] = [
    {
      title: "Management",
      items: [
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
          label: "Activity Log",
          path: "/app/activity-log",
          icon: Activity,
        },
        {
          label: "Notifications",
          path: "/app/notifications",
          icon: Bell,
          badge: unreadCount > 0 ? unreadCount : undefined,
        },
        {
          label: "Settings",
          path: "/app/settings",
          icon: Settings,
        },
        {
          label: "Profile",
          path: "/app/profile",
          icon: User,
        },
      ],
    },
  ];

  const sidebarContent = (
    <div className="flex h-full min-h-0 flex-col justify-between bg-white px-4 py-5 text-slate-800">
      {/* -------------------------------------------------- */}
      {/* 1. BRAND HEADER */}
      {/* -------------------------------------------------- */}
      <div>
        <div className="flex items-center justify-between pb-6">
          <div className="flex items-center gap-3">
            {/* Logo Badge */}
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 border border-sky-100">
              <Stethoscope className="h-6 w-6 stroke-[2.2]" />
            </div>

            {/* Brand Title & Subtitle */}
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold tracking-tight text-slate-900">
                pillpal.csu.edu
              </h2>
              <p className="text-xs text-slate-400 font-normal">
                Management
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
                className="hidden lg:flex rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close sidebar"
                className="lg:hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* -------------------------------------------------- */}
        {/* 2. NAVIGATION LINKS */}
        {/* -------------------------------------------------- */}
        <nav aria-label="Main navigation" className="space-y-6 pt-2">
          {navGroups.map((group, idx) => (
            <div key={idx} className="space-y-1.5">
              {group.title && (
                <p className="px-3 text-xs font-semibold text-slate-400">
                  {group.title}
                </p>
              )}

              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={handleNavClick}
                      className={({ isActive }) =>
                        [
                          "group flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-[#e0f2fe] text-[#0284c7] font-semibold shadow-none"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                        ].join(" ")
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4.5 w-4.5 shrink-0 stroke-[2]" />
                        <span>{item.label}</span>
                      </div>

                      {item.badge !== undefined && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* -------------------------------------------------- */}
      {/* 3. USER FOOTER & SIGN OUT */}
      {/* -------------------------------------------------- */}
      <div className="pt-4 border-t border-slate-100/80">
        <NavLink
          to="/app/profile"
          onClick={handleNavClick}
          title={adminEmail}
          className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-slate-50 transition-colors"
        >
          {/* Blue Circle Avatar Badge */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0284c7] text-white font-bold text-sm shadow-xs">
            {adminName[0]?.toUpperCase() || "A"}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900 leading-snug">
              {adminName}
            </p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              OWNER • CSU CLINIC
            </p>
          </div>
        </NavLink>

        {/* Clean Sign Out Link */}
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-3 flex w-full items-center gap-2 px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50/50"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* DESKTOP SIDEBAR */}
      {!isCollapsed && (
        <aside className="hidden lg:flex h-screen w-64 shrink-0 flex-col border-r border-slate-100 bg-white">
          {sidebarContent}
        </aside>
      )}

      {/* MOBILE DRAWER */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className="fixed inset-0 cursor-default bg-black/40 backdrop-blur-[2px] transition-opacity"
          />

          <aside className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-slate-100 bg-white shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}