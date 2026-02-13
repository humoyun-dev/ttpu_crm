"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, User, LogIn, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  // Auto-focus on username field
  useEffect(() => {
    const usernameInput = document.getElementById("username");
    usernameInput?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      toast.error("Login va parolni kiriting");
      return;
    }

    setLoading(true);
    try {
      const result = await login(username, password);

      console.log("Login result:", result);

      if (result.success) {
        // Token saved, redirect to dashboard
        toast.success("Muvaffaqiyatli kirildi! 👋", {
          duration: 2000,
        });
        // Use window.location for hard redirect to ensure fresh state
        window.location.href = "/dashboard";
      } else {
        // Show error message
        toast.error(result.error || "Login yoki parol noto'g'ri ❌", {
          duration: 4000,
        });
        // Clear password on error
        setPassword("");
        // Re-focus username field
        setTimeout(() => {
          document.getElementById("username")?.focus();
        }, 100);
      }
    } catch (err) {
      console.error("Login error:", err);
      toast.error("Xatolik yuz berdi. Qaytadan urinib ko'ring.", {
        duration: 4000,
      });
      setPassword("");
      setTimeout(() => {
        document.getElementById("username")?.focus();
      }, 100);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <div className="absolute inset-0 bg-grid-slate-200 dark:bg-grid-slate-700/25 [mask-image:linear-linear(0deg,white,rgba(255,255,255,0.6))] dark:[mask-image:linear-linear(0deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05))]" />

      <Card className="w-full max-w-md relative shadow-2xl border-0 dark:border dark:border-gray-800 animate-in fade-in-0 zoom-in-95 duration-500">
        <CardHeader className="space-y-1 text-center pb-4">
          <div className="flex justify-center mb-6">
            <div className="h-20 w-20 rounded-2xl bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/50 dark:shadow-blue-500/30 animate-in zoom-in-50 duration-700">
              <Lock className="h-10 w-10 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold bg-linear-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
            TTPU CRM
          </CardTitle>
          <CardDescription className="text-base">
            Tizimga kirish uchun login va parolingizni kiriting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">
                Login
              </Label>
              <div className="relative group">
                <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  id="username"
                  type="text"
                  placeholder="Loginingizni kiriting"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 h-11 transition-all focus:ring-2 focus:ring-primary/20"
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Parol
              </Label>
              <div className="relative group">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Parolingizni kiriting"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-11 h-11 transition-all focus:ring-2 focus:ring-primary/20"
                  disabled={loading}
                  autoComplete="current-password"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSubmit(e);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:text-primary"
                  tabIndex={-1}
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-11 text-base font-medium bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30 dark:shadow-blue-500/20 transition-all hover:shadow-xl hover:shadow-blue-500/40"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Tekshirilmoqda...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-5 w-5" />
                  Kirish
                </>
              )}
            </Button>

            <div className="text-center text-xs text-muted-foreground pt-2">
              <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">
                Enter
              </kbd>{" "}
              tugmasini bosish orqali ham kirishingiz mumkin
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
