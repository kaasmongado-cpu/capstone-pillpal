import { Navigate, Route, Routes } from "react-router-dom";
import { PatientLayout } from "@/components/layout/PatientLayout";
import { PatientGuard } from "@/guards/PatientGuard";
import { Login } from "@/pages/Login/Login";
import { AuthCallback } from "@/pages/AuthCallback/AuthCallback";
import { CompleteProfile } from "@/pages/Onboarding/CompleteProfile";
import { Dashboard } from "@/pages/Dashboard/Dashboard";
import { Medications } from "@/pages/Medications/Medications";
import { Adherence } from "@/pages/Adherence/Adherence";
import { Appointments } from "@/pages/Appointments/Appointments";
import { Messages } from "@/pages/Messages/Messages";
import { Profile } from "@/pages/Profile/Profile";

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Patient Login & Google OAuth Callback */}
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/onboarding" element={<CompleteProfile />} />

      {/* Protected Patient Portal */}
      <Route element={<PatientGuard />}>
        <Route path="/app" element={<PatientLayout />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="medications" element={<Medications />} />
          <Route path="adherence" element={<Adherence />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="messages" element={<Messages />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Route>

      {/* Fallback Redirects */}
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  );
}
