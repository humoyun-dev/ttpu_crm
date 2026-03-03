"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { authApi, User } from "./api";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const hydratedRef = useRef(false);

  const hydrateUser = useCallback(async () => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    // Skip the /auth/me call entirely when there are no stored tokens
    // to avoid a guaranteed 401 console error.
    const hasToken =
      typeof window !== "undefined" &&
      (localStorage.getItem("access_token") ||
        localStorage.getItem("refresh_token"));

    if (!hasToken) {
      setUser(null);
      setLoading(false);
      const pathname = window?.location?.pathname ?? "";
      if (pathname !== "/login") {
        router.replace("/login");
      }
      return;
    }

    setLoading(true);
    const res = await authApi.me();

    if (res.data) {
      setUser(res.data);
    } else {
      setUser(null);
      // Token invalid yoki 401 - login sahifasiga yo'naltirish
      if (res.error?.code === "UNAUTHORIZED") {
        router.replace("/login");
      }
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    hydrateUser();
  }, [hydrateUser]);

  const login = async (email: string, password: string) => {
    try {
      const res = await authApi.login(email, password);

      if (!res.data) {
        const errorMsg = Array.isArray(res.error?.message)
          ? res.error.message.join(", ")
          : res.error?.message || "Login yoki parol noto'g'ri";
        return { success: false, error: errorMsg };
      }

      const userRes = await authApi.me();
      if (userRes.data) {
        setUser(userRes.data);
      }
      return { success: true };
    } catch (err) {
      console.error("Login error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Xatolik yuz berdi",
      };
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      const result = await authApi.logout();
      setUser(null);
      router.replace("/login");
      router.refresh();
      return result;
    } catch (err) {
      console.error("Logout error:", err);
      setUser(null);
      router.replace("/login");
      router.refresh();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Xatolik yuz berdi",
      };
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
