import {
  Bell,
  LayoutDashboard,
  LogOut,
  Settings,
  Stethoscope,
  Users,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { Button } from "@/components/ui/button";

const navigation = [
  {
    label: "Dashboard",
    path: "/app/dashboard",
    icon: LayoutDashboard,
  },
];

const providerNavigation = [
  {
    label: "All Providers",
    path: "/app/providers",
    icon: Users,
  },
  {
    label: "Doctors",
    path: "/app/providers/doctors",
    icon: Stethoscope,
  },
  {
    label: "Health Staff",
    path: "/app/providers/health-staff",
    icon: Stethoscope,
  },
];

const systemNavigation = [
  {
    label: "Notifications",
    path: "/app/notifications",
    icon: Bell,
  },
  {
    label: "Settings",
    path: "/app/settings",
    icon: Settings,
  },
];

function NavigationItem({
  label,
  path,
  icon: Icon,
}: {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
}) {
  return (
    <NavLink
      to={path}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        ].join(" ")
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </NavLink>
  );
}

function NavigationSection({
  title,
  items,
}: {
  title: string;
  items: typeof navigation;
}) {
  return (
    <div className="space-y-2">
      <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>

      <div className="space-y-1">
        {items.map((item) => (
          <NavigationItem
            key={item.path}
            label={item.label}
            path={item.path}
            icon={item.icon}
          />
        ))}
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="flex min-h-screen w-64 flex-col border-r bg-background">
      <div className="flex h-16 items-center border-b px-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            PILLPAL
          </h1>

          <p className="text-xs text-muted-foreground">
            Admin Portal
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-4">
        <NavigationSection
          title="Overview"
          items={navigation}
        />

        <NavigationSection
          title="Healthcare Providers"
          items={providerNavigation}
        />

        <NavigationSection
          title="System"
          items={systemNavigation}
        />
      </nav>

      <div className="border-t p-4">
        <div className="mb-3 rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              AU
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                Admin User
              </p>

              <p className="truncate text-xs text-muted-foreground">
                Administrator
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}