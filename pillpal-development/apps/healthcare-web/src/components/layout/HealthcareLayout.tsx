import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { FloatingNav } from "@/components/layout/FloatingNav";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";

export function HealthcareLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("pillpal_healthcare_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  function toggleCollapse() {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("pillpal_healthcare_sidebar_collapsed", String(next));
      } catch {
        // silent fail
      }
      return next;
    });
  }

  // Keyboard shortcut (Ctrl+B / Cmd+B) to toggle sidebar collapse
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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900">
      {/* 1. Static Sidebar Shell (Desktop & Mobile Drawer) */}
      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={isCollapsed}
        onClose={() => setSidebarOpen(false)}
      />

      {/* 2. Main Page Area (Independent Scrollable Container) */}
      <div className="flex flex-1 flex-col min-w-0 h-screen overflow-hidden">
        {/* Sticky Header */}
        <Header
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        {/* Scrollable Main Content */}
        <main
          className={`flex-1 overflow-y-auto px-4 py-6 md:px-8 transition-all duration-300 ${
            isCollapsed ? "pb-28 lg:pb-24" : "pb-28 lg:pb-8"
          }`}
        >
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>

        {/* Floating Navigation Dock (Active on mobile & when desktop sidebar is collapsed) */}
        <FloatingNav
          isCollapsed={isCollapsed}
          onOpenMobileMenu={() => setSidebarOpen(true)}
        />
      </div>
    </div>
  );
}
