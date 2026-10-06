import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bell, KeyRound } from "lucide-react";

export function Settings() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          Clinical & Account Settings
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage clinical notifications, consultation availability, and account security.
        </p>
      </div>

      <div className="space-y-4">
        {/* Adherence Alerts Preferences */}
        <Card className="rounded-2xl border border-slate-100 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-[#0284c7]">
              <Bell className="h-4 w-4" />
              <CardTitle className="text-sm font-bold text-slate-900">
                Patient Adherence Notifications
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Configure alert thresholds when patients miss consecutive medication doses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-2 text-xs">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-4 w-4" />
              <span>Notify me immediately if a patient misses <strong>≥ 2 consecutive doses</strong></span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-4 w-4" />
              <span>Send daily summary of patients falling below <strong>80% compliance</strong></span>
            </label>
          </CardContent>
        </Card>

        {/* Security & Password */}
        <Card className="rounded-2xl border border-slate-100 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-[#0284c7]">
              <KeyRound className="h-4 w-4" />
              <CardTitle className="text-sm font-bold text-slate-900">
                Security & Password
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Update your account password or review active session details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <p className="text-xs text-slate-600">
              To update your account password, request a password reset link to your CSU email address.
            </p>
            <Button variant="outline" size="sm" className="rounded-xl text-xs font-semibold">
              Send Password Reset Email
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
