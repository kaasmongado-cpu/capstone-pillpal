import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { getSession, signOut } from "@pillpal/auth";
import { fetchWithAuth } from "@/lib/api";
import { Stethoscope } from "lucide-react";

export function HealthcareGuard() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const {
          data: { session },
        } = await getSession();

        if (!session) {
          if (isMounted) {
            setAuthorized(false);
            setLoading(false);
          }
          return;
        }

        const res = await fetchWithAuth("/me");
        if (!res.ok) {
          await signOut();
          if (isMounted) {
            setErrorMsg("Unable to verify healthcare provider credentials.");
            setAuthorized(false);
            setLoading(false);
          }
          return;
        }

        const user = await res.json();
        const isProvider =
          user.role === "DOCTOR" || user.role === "HEALTH_STAFF";

        if (!isProvider) {
          await signOut();
          if (isMounted) {
            setErrorMsg("Access denied. This portal is restricted to Doctors and Health Staff.");
            setAuthorized(false);
            setLoading(false);
          }
          return;
        }

        if (user.status === "INACTIVE") {
          await signOut();
          if (isMounted) {
            setErrorMsg("Your healthcare provider account is deactivated. Please contact clinic administration.");
            setAuthorized(false);
            setLoading(false);
          }
          return;
        }

        if (isMounted) {
          setAuthorized(true);
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setAuthorized(false);
          setLoading(false);
        }
      }
    }

    void checkAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-slate-800">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-[#0284c7] shadow-sm animate-pulse mb-4">
          <Stethoscope className="h-7 w-7 stroke-[2.2]" />
        </div>
        <p className="text-sm font-semibold text-slate-700">Verifying Clinical Credentials...</p>
        <p className="text-xs text-slate-400 mt-1">CSU Healthcare Provider Portal</p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ error: errorMsg || "Please sign in to access the Healthcare Portal." }}
      />
    );
  }

  return <Outlet />;
}
