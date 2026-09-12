import {
  Bell,
  ChevronDown,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      {/* Left */}
      <div>
        <h1 className="text-lg font-semibold">
          Admin Portal
        </h1>

        <p className="text-sm text-muted-foreground">
          Manage PILLPAL health services
        </p>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search"
        >
          <Search className="h-5 w-5" />
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </Button>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="ml-2 flex items-center gap-2 px-2"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  AU
                </div>

                <div className="hidden text-left sm:block">
                  <p className="text-sm font-medium">
                    Admin User
                  </p>

                  <p className="text-xs text-muted-foreground">
                    Administrator
                  </p>
                </div>

                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            }
          />

          <DropdownMenuContent
            align="end"
            className="w-48"
          >
            <DropdownMenuLabel>
              My Account
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem>
              Profile
            </DropdownMenuItem>

            <DropdownMenuItem>
              Settings
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
