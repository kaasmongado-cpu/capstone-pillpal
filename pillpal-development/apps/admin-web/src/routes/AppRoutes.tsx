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

function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">
        {title}
      </h1>
    </div>
  );
}

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
              path="providers/doctors"
              element={
                <Placeholder title="Doctors" />
              }
            />

            <Route
              path="providers/health-staff"
              element={
                <Placeholder title="Health Staff" />
              }
            />

            <Route
              path="notifications"
              element={
                <Placeholder title="Notifications" />
              }
            />

            <Route
              path="settings"
              element={
                <Placeholder title="Settings" />
              }
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