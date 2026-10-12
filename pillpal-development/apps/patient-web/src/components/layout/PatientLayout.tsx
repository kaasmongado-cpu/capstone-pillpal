import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { fetchWithAuth } from "@/lib/api";

export function PatientLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetchWithAuth("/me");
        if (res.ok) {
          const data = await res.json();
          setUserProfile(data);
        }
      } catch (err) {
        console.error("Failed to load user profile in layout:", err);
      }
    }
    void loadUser();
  }, []);

  const patientName = userProfile
    ? `${userProfile.firstName} ${userProfile.lastName}`
    : "Maria Santos";

  const idNumber = userProfile?.patientProfile?.idNumber || "2022-04912";
  const department = userProfile?.patientProfile?.department || "College of Nursing";
  const allergies = userProfile?.patientProfile?.allergies || "No Known Drug Allergies (NKA)";
  const bloodType = userProfile?.patientProfile?.bloodType || "O+";

  return (
    <div className="flex h-screen w-full bg-[#f8fafc] overflow-hidden text-slate-900">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:w-64 lg:shrink-0">
        <Sidebar
          patientName={patientName}
          idNumber={idNumber}
          department={department}
          allergies={allergies}
          bloodType={bloodType}
        />
      </div>

      {/* Mobile Drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative flex w-64 max-w-xs flex-1 flex-col bg-white">
            <Sidebar
              patientName={patientName}
              idNumber={idNumber}
              department={department}
              allergies={allergies}
              bloodType={bloodType}
              onCloseMobile={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Header
          patientName={patientName}
          idNumber={idNumber}
          department={department}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
