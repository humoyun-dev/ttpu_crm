"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast.error("Login va parolni kiriting");
      return;
    }

    setLoading(true);
    try {
      const result = await login(email.trim(), password);

      if (result.success) {
        toast.success("Muvaffaqiyatli kirildi");
        router.replace("/dashboard");
        router.refresh();
        return;
      const result = await login(email, password);

      console.log("Login result:", result);

      if (result.success) {
        // Token saved, redirect to dashboard
        toast.success("Muvaffaqiyatli kirildi! 👋", {
          duration: 2000,
        });
        // Use window.location for hard redirect to ensure fresh state
        router.replace("/dashboard");
        router.refresh();
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

      toast.error(result.error || "Login yoki parol noto'g'ri");
      setPassword("");
    } catch (err) {
      console.error("Login error:", err);
      toast.error("Xatolik yuz berdi. Qaytadan urinib ko'ring.");
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">TTPU CRM</CardTitle>
        <CardDescription>Tizimga kirish uchun login va parolni kiriting</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Login</Label>
            <Input
              id="email"
              type="text"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Parol</Label>
            <Input
              id="password"
              type="password"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Tekshirilmoqda...
              </>
            ) : (
              "Kirish"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
