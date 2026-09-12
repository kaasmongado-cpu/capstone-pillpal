import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";

import { getSession } from "@pillpal/auth";

const API_URL = "http://localhost:4000";

type AuthState =
  | "loading"
  | "authorized"
  | "unauthorized";

export function AdminGuard() {
  const [authState, setAuthState] =
    useState<AuthState>("loading");

  useEffect(() => {
    async function checkAdminAccess() {
      try {
        const {
          data: { session },
        } = await getSession();

        if (!session) {
          setAuthState("unauthorized");
          return;
        }

        const response = await fetch(`${API_URL}/me`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          setAuthState("unauthorized");
          return;
        }

        const user = await response.json();

        if (user.role !== "ADMIN") {
          setAuthState("unauthorized");
          return;
        }

        setAuthState("authorized");
      } catch {
        setAuthState("unauthorized");
      }
    }

    void checkAdminAccess();
  }, []);

  if (authState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Checking authentication...
        </p>
      </div>
    );
  }

  if (authState === "unauthorized") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}