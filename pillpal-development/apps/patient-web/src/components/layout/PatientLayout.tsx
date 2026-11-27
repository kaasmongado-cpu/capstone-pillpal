import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header, type PatientAlerts } from "./Header";
import { FloatingNav } from "./FloatingNav";
import { fetchWithAuth } from "@/lib/api";

export function PatientLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("pillpal_patient_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [userProfile, setUserProfile] = useState<any>(null);
  const [alerts, setAlerts] = useState<PatientAlerts>({
    unreadMessages: 0,
    pendingDoses: 0,
    upcomingAppointments: 0,
  });

  function toggleCollapse() {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("pillpal_patient_sidebar_collapsed", String(next));
      } catch {
        // silent fail
      }
      return next;
    });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleCollapse();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loadUser = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/me");
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data);
      }
    } catch (err) {
      console.error("Failed to load user profile in layout:", err);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const [convosRes, adhRes, aptsRes] = await Promise.all([
        fetchWithAuth("/messages/conversations"),
        fetchWithAuth("/adherence"),
        fetchWithAuth("/appointments"),
      ]);

      let unreadMessages = 0;
      if (convosRes.ok) {
        const convos: { unreadCount?: number }[] = await convosRes.json();
        unreadMessages = convos.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      }

      let pendingDoses = 0;
      if (adhRes.ok) {
        const adh = await adhRes.json();
        pendingDoses = (adh.todayDoses || []).filter((d: any) => d.status === "PENDING").length;
      }

      let upcomingAppointments = 0;
      if (aptsRes.ok) {
        const apts: { status: string }[] = await aptsRes.json();
        upcomingAppointments = apts.filter(
          (a) =>
            a.status === "CONFIRMED" ||
            a.status === "WAITING" ||
            a.status === "IN_PROGRESS",
        ).length;
      }

      setAlerts({ unreadMessages, pendingDoses, upcomingAppointments });
    } catch {
      // keep previous alert counts silently
    }
  }, []);

  useEffect(() => {
    void loadUser();
    void loadAlerts();

    const onProfileUpdated = () => void loadUser();
    const onMessagesUpdated = () => void loadAlerts();

    window.addEventListener("pillpal:profile-updated", onProfileUpdated);
    window.addEventListener("pillpal:messages-updated", onMessagesUpdated);

    const interval = setInterval(() => {
      void loadAlerts();
    }, 45000);

    return () => {
      window.removeEventListener("pillpal:profile-updated", onProfileUpdated);
      window.removeEventListener("pillpal:messages-updated", onMessagesUpdated);
      clearInterval(interval);
    };
  }, [loadUser, loadAlerts]);

  const patientName = userProfile
    ? `${userProfile.firstName} ${userProfile.lastName}`.trim() || "Patient"
    : "Patient";

  const idNumber = userProfile?.patientProfile?.idNumber || "";
  const department = userProfile?.patientProfile?.department || "";
  const allergies = userProfile?.patientProfile?.allergies || "None recorded";
  const bloodType = userProfile?.patientProfile?.bloodType || "Not set";

  return (
    <div className="flex h-screen w-full bg-[#f8fafc] overflow-hidden text-slate-900">
      {/* Desktop Sidebar */}
      {!isCollapsed && (
        <div className="hidden lg:flex lg:w-64 lg:shrink-0">
          <Sidebar
            patientName={patientName}
            idNumber={idNumber}
            department={department}
            allergies={allergies}
            bloodType={bloodType}
            unreadMessagesCount={alerts.unreadMessages}
          />
        </div>
      )}

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
              unreadMessagesCount={alerts.unreadMessages}
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
          alerts={alerts}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />
        <main
          className={`flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 transition-all duration-300 ${
            isCollapsed ? "pb-28 lg:pb-24" : "pb-28 lg:pb-8"
          }`}
        >
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>

        {/* Floating Navigation Dock (Active on mobile & when desktop sidebar is collapsed) */}
        <FloatingNav
          isCollapsed={isCollapsed}
          unreadMessagesCount={alerts.unreadMessages}
          onOpenMobileMenu={() => setMobileSidebarOpen(true)}
        />
      </div>
    </div>
  );
}
