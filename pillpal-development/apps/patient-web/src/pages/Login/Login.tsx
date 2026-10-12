import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { signIn } from "@pillpal/auth";
import {
  HeartPulse,
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { API_URL } from "@/lib/api";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectMessage = (location.state as any)?.error || "";

  // Mode: "login" | "register"
  const [mode, setMode] = useState<"login" | "register">("login");

  // Sign In Form State
  const [identifier, setIdentifier] = useState("maria.santos@carsu.edu.ph");
  const [password, setPassword] = useState("Password123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(redirectMessage);
  const [successMsg, setSuccessMsg] = useState("");

  // Register Form State
  const [registerForm, setRegisterForm] = useState({
    firstName: "",
    lastName: "",
    idNumber: "",
    department: "College of Nursing",
    userType: "STUDENT",
    email: "",
    password: "",
    bloodType: "O+",
    allergies: "No Known Drug Allergies (NKA)",
  });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      let targetEmail = identifier.trim().toLowerCase();

      // If user provided CSU ID Number instead of email (no @), look up email first
      if (!targetEmail.includes("@")) {
        const lookupRes = await fetch(`${API_URL}/auth/patient/lookup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: targetEmail }),
        });

        if (!lookupRes.ok) {
          throw new Error("No CSU patient account found with this ID Number.");
        }

        const lookupData = await lookupRes.json();
        targetEmail = lookupData.email;
      }

      // Execute Supabase Auth Sign In
      const { data, error: authError } = await signIn(targetEmail, password);
      if (authError || !data.session) {
        throw new Error(authError?.message || "Invalid CSU patient credentials.");
      }

      navigate("/app/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const regRes = await fetch(`${API_URL}/auth/patient/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerForm),
      });

      if (!regRes.ok) {
        const regErr = await regRes.json();
        throw new Error(regErr.message || "Registration failed.");
      }

      // Automatically sign in with newly created credentials
      const { data: authData, error: authErr } = await signIn(
        registerForm.email.toLowerCase().trim(),
        registerForm.password
      );

      if (authErr || !authData.session) {
        setSuccessMsg("Account created! Please sign in with your email and password.");
        setMode("login");
        setIdentifier(registerForm.email);
        setPassword(registerForm.password);
      } else {
        navigate("/app/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Registration error. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  }

  function handleFillDemo(demoIdOrEmail: string) {
    setMode("login");
    setIdentifier(demoIdOrEmail);
    setPassword("Password123!");
    setError("");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50/70 via-slate-50 to-sky-50/60 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25">
            <HeartPulse className="h-7 w-7" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              PILLPAL
            </h1>
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-800">
              PATIENT
            </span>
          </div>
          <p className="text-xs text-slate-500 max-w-xs">
            Caraga State University Student & Employee Personal Health & Medication Portal
          </p>
        </div>

        {/* Card */}
        <Card className="rounded-3xl border border-slate-200/80 bg-white/95 p-2 shadow-xl backdrop-blur-xs">
          {/* Tab Switcher */}
          <div className="flex rounded-2xl bg-slate-100 p-1 m-2">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                mode === "login"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError("");
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                mode === "register"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Student / Patient Sign Up
            </button>
          </div>

          <CardHeader className="pb-3 pt-4 text-center">
            <CardTitle className="text-base font-black text-slate-900">
              {mode === "login"
                ? "Sign In to Your Health Portal"
                : "Register for CSU Health Services"}
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {mode === "login"
                ? "Enter your CSU Email or Student ID Number to access your portal."
                : "Create your patient profile to track prescriptions and clinic visits."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700 flex items-start gap-2 border border-red-100 animate-in fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 flex items-start gap-2 border border-emerald-200 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="identifier" className="text-xs font-bold text-slate-700">
                      CSU Email or Student / Employee ID
                    </Label>
                    <span className="text-[10px] text-slate-400">e.g. 2022-04912</span>
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      id="identifier"
                      required
                      placeholder="e.g. maria.santos@carsu.edu.ph or 2022-04912"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="pl-9.5 text-xs rounded-xl h-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-bold text-slate-700">
                    Account Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      id="password"
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9.5 text-xs rounded-xl h-10"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-black shadow-md shadow-emerald-600/20 text-white gap-2 cursor-pointer transition-all"
                >
                  {loading ? "Signing in..." : "Sign In to Patient Portal"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">First Name</Label>
                    <Input
                      required
                      placeholder="e.g. Ana"
                      value={registerForm.firstName}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, firstName: e.target.value })
                      }
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name</Label>
                    <Input
                      required
                      placeholder="e.g. Reyes"
                      value={registerForm.lastName}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, lastName: e.target.value })
                      }
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">CSU ID Number</Label>
                    <Input
                      required
                      placeholder="e.g. 2024-05123"
                      value={registerForm.idNumber}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, idNumber: e.target.value })
                      }
                      className="rounded-xl text-xs h-9 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">College / Department</Label>
                    <select
                      value={registerForm.department}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, department: e.target.value })
                      }
                      className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-slate-800"
                    >
                      <option value="College of Nursing">College of Nursing</option>
                      <option value="College of Computing and Information Sciences">CCIS</option>
                      <option value="College of Engineering and Geo-Sciences">CEGS</option>
                      <option value="College of Education">College of Education</option>
                      <option value="College of Arts and Sciences">CAS</option>
                      <option value="University Administrative Staff">Admin Employee</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">University Email</Label>
                  <Input
                    type="email"
                    required
                    placeholder="e.g. ana.reyes@carsu.edu.ph"
                    value={registerForm.email}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, email: e.target.value })
                    }
                    className="rounded-xl text-xs h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Account Password</Label>
                  <Input
                    type="password"
                    required
                    placeholder="At least 8 characters"
                    value={registerForm.password}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, password: e.target.value })
                    }
                    className="rounded-xl text-xs h-9"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">Blood Type</Label>
                    <select
                      value={registerForm.bloodType}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, bloodType: e.target.value })
                      }
                      className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-slate-800"
                    >
                      <option value="O+">O+</option>
                      <option value="A+">A+</option>
                      <option value="B+">B+</option>
                      <option value="AB+">AB+</option>
                      <option value="O-">O-</option>
                      <option value="A-">A-</option>
                      <option value="B-">B-</option>
                      <option value="AB-">AB-</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Known Drug Allergies</Label>
                    <Input
                      placeholder="e.g. Penicillin or NKA"
                      value={registerForm.allergies}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, allergies: e.target.value })
                      }
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-black shadow-md shadow-emerald-600/20 text-white gap-2 cursor-pointer transition-all mt-2"
                >
                  {loading ? "Creating Account..." : "Complete Registration & Sign In"}
                  <Sparkles className="h-4 w-4" />
                </Button>
              </form>
            )}

            {/* Fast Fill Demo Profiles for Testing */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">
                Fast Sign-In (Demo Patients)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleFillDemo("maria.santos@carsu.edu.ph")}
                  className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2 text-left hover:bg-emerald-100/70 transition-colors cursor-pointer"
                >
                  <p className="text-[11px] font-black text-emerald-900">Maria Santos</p>
                  <p className="text-[10px] text-emerald-700 font-mono">ID: 2022-04912</p>
                </button>
                <button
                  type="button"
                  onClick={() => handleFillDemo("juan.delacruz@carsu.edu.ph")}
                  className="rounded-xl border border-sky-200 bg-sky-50/60 p-2 text-left hover:bg-sky-100/70 transition-colors cursor-pointer"
                >
                  <p className="text-[11px] font-black text-sky-900">Juan Dela Cruz</p>
                  <p className="text-[10px] text-sky-700 font-mono">ID: 2021-08123</p>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer Security Badge */}
        <div className="flex items-center justify-center gap-2 text-slate-400 text-xs">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Protected by CSU Health Information Privacy Policy</span>
        </div>
      </div>
    </div>
  );
}
