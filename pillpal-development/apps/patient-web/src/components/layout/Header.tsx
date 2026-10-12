import { Menu, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  patientName?: string;
  idNumber?: string;
  department?: string;
  onOpenMobileSidebar?: () => void;
}

export function Header({
  patientName = "Maria Santos",
  idNumber = "2022-04912",
  department = "College of Nursing",
  onOpenMobileSidebar,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden cursor-pointer"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-black text-slate-900">
              Welcome back, {patientName.split(" ")[0]}!
            </h1>
            <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
              Active Patient
            </span>
          </div>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Track your medications, log daily doses, and stay connected with CSU Clinic.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* CSU ID & Department Tag */}
        <div className="hidden md:flex flex-col text-right">
          <span className="font-mono text-xs font-bold text-slate-800">{idNumber}</span>
          <span className="text-[10px] text-slate-400">{department}</span>
        </div>

        {/* Emergency Help Action */}
        <a href="tel:0853412786" className="hidden sm:block">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-xl border-red-200 bg-red-50/60 text-red-700 hover:bg-red-100 text-xs font-bold"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
            <span className="hidden lg:inline">CSU Clinic Emergency</span>
            <span className="lg:hidden">Emergency</span>
          </Button>
        </a>

        {/* User Profile Avatar */}
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-xs">
          {patientName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </div>
      </div>
    </header>
  );
}
