import { useEffect, useState } from "react";
import {
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  User,
  UserCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getSession, signOut } from "@pillpal/auth";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AdminProfileData = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  userType: string;
  createdAt?: string;
};

export function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AdminProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      try {
        const {
          data: { session },
        } = await getSession();

        if (!session) {
          navigate("/login");
          return;
        }

        const response = await fetchWithAuth("/me");

        if (response.ok) {
          const user = await response.json();
          setProfile(user);
        } else {
          navigate("/login");
        }
      } catch {
        navigate("/login");
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, [navigate]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      navigate("/login");
    } catch (error) {
      console.error("Sign out error:", error);
      navigate("/login");
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Administrator Profile
        </h1>
        <p className="text-sm text-muted-foreground">
          Your personal account details, administrative credentials, and session controls.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Card */}
        <Card className="border-border/60 shadow-sm md:col-span-1">
          <CardContent className="flex flex-col items-center p-6 text-center">
            {loading ? (
              <>
                <Skeleton className="h-20 w-20 rounded-full" />
                <Skeleton className="h-5 w-32 mt-4" />
                <Skeleton className="h-3.5 w-44 mt-2" />
                <Skeleton className="h-6 w-20 rounded-full mt-3" />
              </>
            ) : (
              <>
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0284c7] text-2xl font-bold text-white shadow-sm">
                  {profile ? `${profile.firstName[0]}${profile.lastName[0]}` : "AU"}
                </div>

                <h2 className="mt-4 text-lg font-semibold text-foreground">
                  {profile ? `${profile.firstName} ${profile.lastName}` : "Administrator"}
                </h2>

                <p className="text-xs text-muted-foreground">{profile?.email}</p>

                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#e0f2fe] px-3 py-1 text-xs font-semibold text-[#0284c7]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {profile?.role || "ADMIN"}
                </div>
              </>
            )}

            <div className="mt-6 w-full border-t pt-4">
              <Button
                variant="outline"
                className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleSignOut}
                disabled={signingOut || loading}
              >
                <LogOut className="h-4 w-4" />
                {signingOut ? "Signing out..." : "Sign out"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Profile Details */}
        <div className="space-y-6 md:col-span-2">
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Account Information</CardTitle>
              <CardDescription>Verified details linked to your administrative identity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span>Full Name</span>
                </div>
                {loading ? (
                  <Skeleton className="h-4 w-36" />
                ) : (
                  <span className="font-medium text-foreground">
                    {`${profile?.firstName} ${profile?.lastName}`}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>Email Address</span>
                </div>
                {loading ? (
                  <Skeleton className="h-4 w-48" />
                ) : (
                  <span className="font-medium text-foreground">
                    {profile?.email}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UserCheck className="h-4 w-4" />
                  <span>Role Classification</span>
                </div>
                <span className="font-semibold text-primary">
                  System Administrator
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                  <span>Authentication</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Managed by Supabase Auth
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
