"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
    <div className="w-full max-w-sm">
      {/* Mobile-only logo */}
      <div className="mb-10 text-center lg:hidden">
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md font-display text-lg font-semibold"
          style={{ backgroundColor: "oklch(0.19 0.13 264)", color: "white" }}
        >
          T
        </div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-primary">TTPU</h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Bandlik Markazi
        </p>
      </div>

      <div className="mb-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Tizimga kirish
        </p>
        <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-foreground">
          Admin panel
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Email va parolingizni kiriting
        </p>
        <div className="relative mt-4 h-px w-full bg-border">
          <span className="absolute left-0 top-0 h-px w-12 bg-accent-gold" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label
            htmlFor="email"
            className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            Email
          </Label>
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
          <Label
            htmlFor="password"
            className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            Parol
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

      <p className="mt-8 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        Turin Politexnika Universiteti — Toshkent
      </p>
    </div>
  );
}
