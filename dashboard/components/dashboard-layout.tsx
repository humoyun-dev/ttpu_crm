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
  BookOpen,
  Building2,
  Briefcase,
  FileText,
  TrendingUp,
  LayoutDashboard,
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
      { title: "Ro'yxatga olish", href: "/dashboard/enrollments", icon: BookOpen },
    ],
  },
  {
    label: "ANALITIKA",
    items: [
      { title: "So'rovnoma", href: "/dashboard/analytics/surveys", icon: BarChart3 },
      { title: "Ro'yxat", href: "/dashboard/analytics/enrollments", icon: TrendingUp },
      { title: "Hisobotlar", href: "/dashboard/reports", icon: TrendingUp },
    ],
  },
  {
    label: "BOSHQARUV",
    items: [
      { title: "Katalog", href: "/dashboard/catalog", icon: FolderTree },
      { title: "Ish beruvchilar", href: "/dashboard/employers", icon: Building2 },
      { title: "Leadlar", href: "/dashboard/leads", icon: Briefcase },
      { title: "Hujjatlar", href: "/dashboard/documents", icon: FileText },
    ],
  },
];

function SidebarContent() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
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
      <div
        className="flex h-16 shrink-0 items-center gap-3 px-5"
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-black"
          style={{ backgroundColor: "var(--sidebar-primary)", color: "white" }}
        >
          T
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold" style={{ color: "white" }}>TTPU</p>
          <p
            className="text-[10px] tracking-wide"
            style={{ color: "var(--sidebar-foreground)", opacity: 0.5 }}
          >
            Bandlik Markazi
          </p>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p
              className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--sidebar-foreground)", opacity: 0.35 }}
            >
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = (item as { exact?: boolean }).exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                    )}
                    style={
                      isActive
                        ? {
                            backgroundColor: "var(--sidebar-primary)",
                            color: "var(--sidebar-primary-foreground)",
                            fontWeight: 600,
                          }
                        : {
                            color: "var(--sidebar-foreground)",
                            opacity: 0.8,
                          }
                    }
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        const el = e.currentTarget as HTMLAnchorElement;
                        el.style.backgroundColor = "var(--sidebar-accent)";
                        el.style.color = "var(--sidebar-accent-foreground)";
                        el.style.opacity = "1";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        const el = e.currentTarget as HTMLAnchorElement;
                        el.style.backgroundColor = "transparent";
                        el.style.color = "var(--sidebar-foreground)";
                        el.style.opacity = "0.8";
                      }
                    }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div
        className="shrink-0 p-3"
        style={{ borderTop: "1px solid var(--sidebar-border)" }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors"
              style={{ color: "var(--sidebar-foreground)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--sidebar-accent)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
              }}
            >
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback
                  className="text-xs font-bold"
                  style={{
                    backgroundColor: "oklch(0.76 0.165 76 / 25%)",
                    color: "oklch(0.76 0.165 76)",
                  }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-none" style={{ color: "white" }}>
                  {user?.email || "User"}
                </p>
                <p
                  className="mt-0.5 text-xs capitalize"
                  style={{ color: "var(--sidebar-foreground)", opacity: 0.5 }}
                >
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
            <span className="text-sm font-bold text-primary">TTPU</span>
            <span className="text-sm text-muted-foreground">Bandlik Markazi</span>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
