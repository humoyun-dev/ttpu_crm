"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  GraduationCap,
  Building2,
  FlaskConical,
  BookOpenCheck,
  Users,
  FolderTree,
  LogOut,
  ChevronRight,
  Menu,
  Loader2,
  BarChart3,
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

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
}

const navigation: NavItem[] = [
  {
    title: "Arizalar",
    href: "/dashboard/applications",
    icon: ClipboardList,
    children: [
      {
        title: "Qabul 2026",
        href: "/dashboard/applications/admissions",
        icon: GraduationCap,
      },
      {
        title: "Campus Tour",
        href: "/dashboard/applications/campus",
        icon: Building2,
      },
      {
        title: "Polito Academy",
        href: "/dashboard/applications/polito",
        icon: FlaskConical,
      },
      {
        title: "Foundation Year",
        href: "/dashboard/applications/foundation",
        icon: BookOpenCheck,
      },
    ],
  },
  {
    title: "So'rovnomalar",
    href: "/dashboard/surveys",
    icon: Users,
  },
  {
    title: "Talabalar soni",
    href: "/dashboard/enrollments",
    icon: Users,
  },
  {
    title: "Analitika",
    href: "/dashboard/analytics",
    icon: BarChart3,
    children: [
      {
        title: "Qabul 2026",
        href: "/dashboard/analytics/admissions",
        icon: GraduationCap,
      },
      {
        title: "Campus Tour",
        href: "/dashboard/analytics/campus",
        icon: Building2,
      },
      {
        title: "Polito Academy",
        href: "/dashboard/analytics/polito",
        icon: FlaskConical,
      },
      {
        title: "Foundation Year",
        href: "/dashboard/analytics/foundation",
        icon: BookOpenCheck,
      },
      {
        title: "So'rovnoma",
        href: "/dashboard/analytics/surveys",
        icon: Users,
      },
      {
        title: "Talabalar soni",
        href: "/dashboard/analytics/enrollments",
        icon: BarChart3,
      },
    ],
  },
  {
    title: "Katalog",
    href: "/dashboard/catalog",
    icon: FolderTree,
  },
];

function NavLink({
  item,
  collapsed = false,
}: {
  item: NavItem;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const isActive =
    pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{item.title}</span>}
    </Link>
  );
}

function SidebarContent() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    const result = await logout();

    if (!result.success) {
      toast.error(result.error || "Chiqishda xatolik yuz berdi");
    } else {
      toast.success("Tizimdan chiqdingiz");
    }

    setIsLoggingOut(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">TTPU CRM</p>
          <p className="text-sm font-semibold">Dashboard</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {navigation.map((item) => (
          <div key={item.href}>
            <NavLink item={item} />
            {item.children && (
              <div className="ml-4 mt-1 space-y-1 border-l pl-3">
                {item.children.map((child) => {
                  const isChildActive =
                    pathname === child.href ||
                    pathname.startsWith(child.href + "/");
                  const ChildIcon = child.icon;
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                        isChildActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <ChildIcon className="h-3.5 w-3.5" />
                      {child.title}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* User menu */}
      <div className="border-t p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 px-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {user?.email?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">{user?.email || "User"}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {user?.role || "viewer"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem disabled>
              <span className="text-muted-foreground">{user?.email}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-600 focus:text-red-700"
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              {isLoggingOut ? "Chiqilmoqda..." : "Chiqish"}
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
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-card lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex h-16 items-center justify-between gap-4 border-b bg-card px-4">
          <div className="flex items-center gap-4">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
            </Sheet>
            <div className="flex items-center gap-2 lg:hidden">
              <LayoutDashboard className="h-5 w-5 text-primary" />
              <span className="font-semibold">TTPU CRM</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
