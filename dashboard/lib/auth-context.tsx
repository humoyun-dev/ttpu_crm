"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { authApi, User } from "./api";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("access_token");
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await authApi.me();
      if (res.data) {
        setUser(res.data);
      } else {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await authApi.login(email, password);

      if (res.data) {
        // Token saved successfully by authApi.login
        const userRes = await authApi.me();
        if (userRes.data) {
          setUser(userRes.data);
          return { success: true };
        }
        // Got token but failed to fetch user - still success
        return { success: true };
      }

      // Login failed - return error message
      const errorMsg = Array.isArray(res.error?.message)
        ? res.error.message.join(", ")
        : res.error?.message || "Login yoki parol noto'g'ri";
      return { success: false, error: errorMsg };
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
