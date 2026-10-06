import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { AdminGuard } from "@/components/auth/AdminGuard";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminSetup } from "@/pages/AdminSetup/AdminSetup";
import { Dashboard } from "@/pages/Dashboard/Dashboard";
import { Login } from "@/pages/Login/Login";
import { Providers } from "@/pages/Providers/Providers";
import { ActivityLog } from "@/pages/ActivityLog/ActivityLog";
import { Notifications } from "@/pages/Notifications/Notifications";
import { Settings } from "@/pages/Settings/Settings";
import { Profile } from "@/pages/Profile/Profile";

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/admin/setup"
          element={<AdminSetup />}
        />

        <Route
          path="/login"
          element={<Login />}
        />

        <Route element={<AdminGuard />}>
          <Route
            path="/app"
            element={<AdminLayout />}
          >
            <Route
              index
              element={
                <Navigate
                  to="dashboard"
                  replace
                />
              }
            />

            <Route
              path="dashboard"
              element={<Dashboard />}
            />

            <Route
              path="providers"
              element={<Providers />}
            />

            <Route
              path="activity-log"
              element={<ActivityLog />}
            />

            <Route
              path="notifications"
              element={<Notifications />}
            />

            <Route
              path="settings"
              element={<Settings />}
            />

            <Route
              path="profile"
              element={<Profile />}
            />
          </Route>
        </Route>

        <Route
          path="/"
          element={
            <Navigate
              to="/login"
              replace
            />
          }
        />

        <Route
          path="*"
          element={
            <Navigate
              to="/login"
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}