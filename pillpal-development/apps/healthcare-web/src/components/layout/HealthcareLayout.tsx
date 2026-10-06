import { useState } from "react";
import { Outlet } from "react-router-dom";
import { FloatingNav } from "@/components/layout/FloatingNav";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";

export function HealthcareLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900">
      {/* 1. Static Sidebar Shell (Desktop & Mobile Drawer) */}
      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
        onClose={() => setSidebarOpen(false)}
      />

      {/* 2. Main Page Area (Independent Scrollable Container) */}
      <div className="flex flex-1 flex-col min-w-0 h-screen overflow-hidden">
        {/* Sticky Header */}
        <Header
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        {/* Scrollable Main Content */}
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 pb-24 lg:pb-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>

        {/* Mobile Floating Pill Navigation */}
        <FloatingNav />
      </div>
    </div>
  );
}
