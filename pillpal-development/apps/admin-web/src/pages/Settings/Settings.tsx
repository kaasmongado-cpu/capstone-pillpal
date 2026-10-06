import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Database,
  Globe,
  KeyRound,
  RefreshCw,
  Server,
  Shield,
  Sliders,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function Settings() {
  const [apiHealth, setApiHealth] = useState<"checking" | "online" | "offline">("checking");
  const [lastChecked, setLastChecked] = useState<string>("");

  async function checkApiHealth() {
    setApiHealth("checking");
    try {
      const response = await fetch(`${API_URL}/health`);
      if (response.ok) {
        setApiHealth("online");
      } else {
        setApiHealth("offline");
      }
    } catch {
      setApiHealth("offline");
    } finally {
      setLastChecked(new Date().toLocaleTimeString());
    }
  }

  useEffect(() => {
    void checkApiHealth();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          System Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Platform configuration, environment parameters, and security policies.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* University & System Profile */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary">
              <Globe className="h-5 w-5" />
              <CardTitle className="text-base">Institutional Configuration</CardTitle>
            </div>
            <CardDescription>Target academic institution details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground">Institution:</span>
              <span className="font-semibold text-foreground">Caraga State University (CSU)</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground">Platform Scope:</span>
              <span className="font-medium text-foreground">Campus Health & Medication Adherence</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground">Portal Type:</span>
              <span className="font-medium text-foreground">Management & Administrative Hub</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Environment:</span>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                Development
              </span>
            </div>
          </CardContent>
        </Card>

        {/* API & Backend Health */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <Server className="h-5 w-5" />
                <CardTitle className="text-base">API & Server Connection</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={checkApiHealth}
                className="h-8 gap-1.5 text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${apiHealth === "checking" ? "animate-spin" : ""}`} />
                Check
              </Button>
            </div>
            <CardDescription>Connection status with native Node.js API</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground">API Server URL:</span>
              <code className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{API_URL}</code>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/40 items-center">
              <span className="text-muted-foreground">Status:</span>
              {apiHealth === "online" && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> Online & Healthy
                </span>
              )}
              {apiHealth === "offline" && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive">
                  Offline / Unreachable
                </span>
              )}
              {apiHealth === "checking" && (
                <span className="text-xs text-muted-foreground">Checking connection...</span>
              )}
            </div>
            {lastChecked && (
              <div className="flex justify-between py-1.5">
                <span className="text-muted-foreground">Last Verified:</span>
                <span className="text-xs text-muted-foreground">{lastChecked}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security & Access Policies */}
        <Card className="border-border/60 shadow-sm md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary">
              <Shield className="h-5 w-5" />
              <CardTitle className="text-base">Security & Authentication Policies</CardTitle>
            </div>
            <CardDescription>Authentication and role-based access controls</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <KeyRound className="h-4 w-4 text-primary" />
                Auth Provider
              </div>
              <p className="text-xs text-muted-foreground">
                Supabase Auth (JWT bearer token validation on every administrative request).
              </p>
            </div>

            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <Sliders className="h-4 w-4 text-primary" />
                Access Control
              </div>
              <p className="text-xs text-muted-foreground">
                Strict `ADMIN` role verification for user management, activations, and audits.
              </p>
            </div>

            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <Database className="h-4 w-4 text-primary" />
                Data Isolation
              </div>
              <p className="text-xs text-muted-foreground">
                Prisma ORM connected to NeonDB PostgreSQL cloud instance.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
