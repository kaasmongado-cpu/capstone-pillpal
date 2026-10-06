import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { FloatingNav } from "./FloatingNav";

export function AdminLayout() {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("pillpal_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  function toggleCollapse() {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("pillpal_sidebar_collapsed", String(next));
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
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Persistent / Collapsible Sidebar & Mobile Slide-over Drawer */}
      <Sidebar
        isOpen={mobileDrawerOpen}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
        onClose={() => setMobileDrawerOpen(false)}
      />

      {/* Main Content Area (Independent scroll container while sidebar remains static) */}
      <div className="flex min-w-0 flex-1 flex-col h-screen overflow-y-auto transition-all duration-300">
        <Header
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          onOpenSidebar={() => setMobileDrawerOpen(true)}
        />

        {/* Responsive main container */}
        <main className={`flex-1 p-4 sm:p-6 lg:p-8 transition-all duration-300 ${
          isCollapsed ? "pb-28 lg:pb-24" : "pb-28 lg:pb-8"
        }`}>
          <Outlet />
        </main>
      </div>

      {/* Floating Navigation Dock (Active on mobile & when desktop sidebar is collapsed) */}
      <FloatingNav
        isCollapsed={isCollapsed}
        onExpandSidebar={toggleCollapse}
        onOpenMobileMenu={() => setMobileDrawerOpen(true)}
      />
    </div>
  );
}