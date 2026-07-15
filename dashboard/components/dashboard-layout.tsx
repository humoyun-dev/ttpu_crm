"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  FolderTree,
  LogOut,
  Menu,
  Loader2,
  BarChart3,
  GraduationCap,
  Building2,
  Briefcase,
  FileText,
  TrendingUp,
  LayoutDashboard,
  Coins,
  ShieldCheck,
  Megaphone,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { useState } from "react";
import { toast } from "sonner";

const NAV_SECTIONS = [
  {
    label: "ASOSIY",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "TALABALAR",
    items: [
      { title: "So'rovnomalar", href: "/dashboard/surveys", icon: Users },
      { title: "Talabalar", href: "/dashboard/students", icon: GraduationCap },
      { title: "AI Tekshiruv", href: "/dashboard/ai-verifications", icon: ShieldCheck },
    ],
  },
  {
    label: "ANALITIKA",
    items: [
      { title: "So'rovnoma", href: "/dashboard/analytics/surveys", icon: BarChart3 },
      { title: "Ro'yxat", href: "/dashboard/analytics/enrollments", icon: TrendingUp },
      { title: "Hisobotlar", href: "/dashboard/reports", icon: TrendingUp },
      { title: "AI Xarajatlar", href: "/dashboard/ai-costs", icon: Coins },
    ],
  },
  {
    label: "BOSHQARUV",
    items: [
      { title: "Katalog", href: "/dashboard/catalog", icon: FolderTree },
      { title: "Ish beruvchilar", href: "/dashboard/employers", icon: Building2 },
      { title: "Leadlar", href: "/dashboard/leads", icon: Briefcase },
      // Vakansiyalar API'si to'liq admin-only — viewer'ga ko'rsatilmaydi.
      { title: "Vakansiyalar", href: "/dashboard/vacancies", icon: Megaphone, adminOnly: true },
      { title: "Amaliyot", href: "/dashboard/internships", icon: ClipboardList },
      { title: "Hujjatlar", href: "/dashboard/documents", icon: FileText },
    ],
  },
];

function SidebarContent() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    const res = await logout();
    if (!res.success) toast.error(res.error || "Xatolik");
    else toast.success("Tizimdan chiqdingiz");
    setLoggingOut(false);
  };

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : "U";

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-display text-base font-bold text-white">
          T
        </div>
        <div className="leading-tight">
          <p className="font-display text-sm font-semibold text-white">TTPU</p>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-sidebar-foreground/50">
            Bandlik Markazi
          </p>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter(
            (item) => !(item as { adminOnly?: boolean }).adminOnly || isAdmin,
          );
          if (visibleItems.length === 0) return null;
          return (
          <div key={section.label}>
            <p className="mb-1.5 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const isActive = (item as { exact?: boolean }).exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent-gold" />
                    )}
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </Link>
                );
              })}
            </div>
          </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-accent">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="bg-accent-gold/20 font-mono text-xs font-semibold text-accent-gold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-none text-white">
                  {user?.email || "User"}
                </p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-sidebar-foreground/50">
                  {user?.role || "viewer"}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-52">
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              {user?.email}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-destructive focus:text-destructive"
            >
              {loggingOut ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              {loggingOut ? "Chiqilmoqda..." : "Chiqish"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className="hidden h-full w-60 shrink-0 lg:flex lg:flex-col"
        style={{ backgroundColor: "var(--sidebar)", borderRight: "1px solid var(--sidebar-border)" }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-60 p-0"
          style={{ backgroundColor: "var(--sidebar)", borderRight: "1px solid var(--sidebar-border)" }}
        >
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main area */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </Sheet>
          <div className="flex items-center gap-2 lg:hidden">
            <span className="font-display text-sm font-semibold text-primary">TTPU</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Bandlik Markazi
            </span>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto w-full max-w-6xl p-4 md:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
