import { useEffect, useState } from "react";
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  PanelLeft,
  PanelLeftOpen,
  Settings,
  Shield,
  Stethoscope,
  User,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { signOut } from "@pillpal/auth";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
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

export function Header({
  isCollapsed = false,
  onToggleCollapse,
  onOpenSidebar,
}: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    async function loadUnreadCount() {
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
    void loadUnreadCount();
  }, [location.pathname]);

  async function handleSignOut() {
    try {
      await signOut();
      navigate("/login");
    } catch {
      navigate("/login");
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-100 bg-white/95 px-6 backdrop-blur-xs transition-all duration-200">
      {/* Left: Collapse Toggle + Portal Logo + Management Portal Header */}
      <div className="flex items-center gap-3">
        {/* Desktop Collapse Toggle */}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label="Toggle Sidebar"
            className="hidden lg:flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4 text-[#0284c7]" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Mobile Menu Button */}
        {onOpenSidebar && (
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Open navigation drawer"
            className="lg:hidden h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-2xs"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {/* Portal Emblem & Title */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 border border-sky-100">
            <Stethoscope className="h-5 w-5 stroke-[2.2]" />
          </div>

          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 leading-tight">
              Management Portal
            </h1>
            <p className="text-[11px] text-slate-400 font-normal">
              pillpal.csu.edu.ph
            </p>
          </div>
        </div>
      </div>

      {/* Right: Store/Clinic Role & Profile Dropdown */}
      <div className="flex items-center gap-4">
        {/* Clinic / Role Label from Inspiration */}
        <div className="hidden sm:block text-right">
          <p className="text-xs font-bold text-slate-800 leading-none">
            CSU Clinic
          </p>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
            OWNER
          </p>
        </div>

        {/* Notifications Icon Button */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          onClick={() => navigate("/app/notifications")}
          className="relative h-9 w-9 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl"
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0284c7] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0284c7]" />
            </span>
          )}
        </Button>

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7]/50"
            aria-label="User Profile Menu"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0284c7] text-xs font-bold text-white shadow-2xs">
              A
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" side="bottom" sideOffset={8} className="w-56 rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl">
            <DropdownMenuLabel className="px-2.5 py-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-[#0284c7]">
                  <Shield className="h-4 w-4" />
                </div>
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-slate-900">CSU Administrator</p>
                  <p className="text-[10px] font-normal text-slate-400">admin@csu.edu.ph</p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-1 -mx-1.5 h-px bg-slate-100" />

            <DropdownMenuItem onClick={() => navigate("/app/profile")} className="cursor-pointer gap-2.5 px-2.5 py-2 text-xs text-slate-700">
              <User className="h-4 w-4 text-slate-400" />
              <span>Admin Profile</span>
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => navigate("/app/settings")} className="cursor-pointer gap-2.5 px-2.5 py-2 text-xs text-slate-700">
              <Settings className="h-4 w-4 text-slate-400" />
              <span>System Settings</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1 -mx-1.5 h-px bg-slate-100" />

            <DropdownMenuItem onClick={handleSignOut} variant="destructive" className="cursor-pointer gap-2.5 px-2.5 py-2 text-xs text-red-600 hover:bg-red-50 data-highlighted:bg-red-50 data-highlighted:text-red-600">
              <LogOut className="h-4 w-4 text-red-500" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
