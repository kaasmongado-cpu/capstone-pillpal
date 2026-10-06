import { Navigate, Route, Routes } from "react-router-dom";
import { HealthcareLayout } from "@/components/layout/HealthcareLayout";
import { HealthcareGuard } from "@/guards/HealthcareGuard";
import { Adherence } from "@/pages/Adherence/Adherence";
import { Appointments } from "@/pages/Appointments/Appointments";
import { Dashboard } from "@/pages/Dashboard/Dashboard";
import { Inventory } from "@/pages/Inventory/Inventory";
import { Login } from "@/pages/Login/Login";
import { Medications } from "@/pages/Medications/Medications";
import { Messages } from "@/pages/Messages/Messages";
import { Patients } from "@/pages/Patients/Patients";
import { Profile } from "@/pages/Profile/Profile";
import { SetPassword } from "@/pages/SetPassword/SetPassword";
import { Settings } from "@/pages/Settings/Settings";

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Healthcare Authentication */}
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/reset-password" element={<SetPassword />} />

      {/* Protected Healthcare Workspace */}
      <Route element={<HealthcareGuard />}>
        <Route path="/app" element={<HealthcareLayout />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="patients" element={<Patients />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="medications" element={<Medications />} />
          <Route path="adherence" element={<Adherence />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="messages" element={<Messages />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>

      {/* Fallback Redirects */}
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  );
}
