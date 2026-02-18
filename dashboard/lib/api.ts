// API client for TTPU CRM Dashboard

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const AUTH_MARKER_COOKIE = "dashboard_auth";
const AUTH_MARKER_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string | string[];
  };
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Auth
export interface LoginResponse {
  access: string;
  refresh: string;
}

export interface LogoutResult {
  success: boolean;
  error?: string;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "admin" | "viewer";
}

// Catalog
export type CatalogType =
  | "program"
  | "direction"
  | "region"
  | "track"
  | "subject";

export interface CatalogItem {
  id: string;
  type: CatalogType;
  code: string | null;
  name: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
  description?: string;
  parent: string | null;
  is_active: boolean;
  sort_order: number;
  meta: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Bot1 Applicant
export interface Bot1Applicant {
  id: string;
  telegram_user_id: number;
  telegram_chat_id: number | null;
  username: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  region: string | null;
  region_details?: CatalogItemNested;
  created_at: string;
  updated_at: string;
}

// Nested Catalog Item (from API)
export interface CatalogItemNested {
  id: string;
  code: string | null;
  name: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
  type: CatalogType;
}

// Applications
export interface Admissions2026Application {
  id: string;
  applicant: string;
  applicant_details?: Bot1Applicant;
  direction: string;
  direction_details?: CatalogItemNested;
  track: string | null;
  track_details?: CatalogItemNested;
  status: "new" | "submitted" | "in_progress" | "approved" | "rejected";
  answers?: Record<string, unknown>;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampusTourRequest {
  id: string;
  applicant: string;
  applicant_details?: Bot1Applicant;
  preferred_date: string | null;
  answers: Record<string, unknown>;
  status: "new" | "submitted" | "in_progress" | "approved" | "rejected";
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FoundationRequest {
  id: string;
  applicant: string;
  applicant_details?: Bot1Applicant;
  answers?: Record<string, unknown>;
  status: "new" | "submitted" | "in_progress" | "approved" | "rejected";
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PolitoAcademyRequest {
  id: string;
  applicant: string;
  applicant_details?: Bot1Applicant;
  subject: string | null;
  subject_details?: CatalogItemNested;
  answers?: Record<string, unknown>;
  status: "new" | "submitted" | "in_progress" | "approved" | "rejected";
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Bot2 Survey
export interface Bot2SurveyResponse {
  id: string;
  student: string;
  student_details?: Bot2Student;
  roster: string;
  program: string;
  program_details?: CatalogItemNested;
  course_year: number;
  survey_campaign: string;
  employment_status: string;
  employment_company: string;
  employment_role: string;
  suggestions: string;
  consents: Record<string, unknown>;
  answers: Record<string, unknown>;
  is_complete: boolean;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Bot2Student {
  id: string;
  student_external_id: string;
  roster: string;
  telegram_user_id: number | null;
  username: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender: "male" | "female" | "other" | "unspecified";
  phone: string;
  region: string | null;
  region_details?: CatalogItemNested;
  created_at: string;
  updated_at: string;
}

export interface StudentRoster {
  id: string;
  student_external_id: string;
  roster_campaign: string;
  program: string;
  program_details?: CatalogItemNested;
  course_year: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProgramEnrollment {
  id: string;
  program: string;
  program_details?: {
    id: string;
    name: string;
    code: string | null;
  };
  course_year: number;
  student_count: number;
  responded_count?: number;
  coverage_percent?: number;
  academic_year: string;
  campaign: string;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

// Helper to get token
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

function setAuthMarkerCookie(enabled: boolean) {
  if (typeof document === "undefined") return;
  if (enabled) {
    document.cookie = `${AUTH_MARKER_COOKIE}=1; path=/; max-age=${AUTH_MARKER_MAX_AGE_SECONDS}; samesite=lax`;
    return;
  }
  document.cookie = `${AUTH_MARKER_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

function persistTokens(accessToken: string, refreshToken: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("access_token", accessToken);
  localStorage.setItem("refresh_token", refreshToken);
  setAuthMarkerCookie(true);
}

function clearStoredTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  setAuthMarkerCookie(false);
}

let refreshRequest: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshRequest) return refreshRequest;

  refreshRequest = (async () => {
    const refreshToken =
      typeof window !== "undefined"
        ? localStorage.getItem("refresh_token")
        : null;
    if (!refreshToken) return false;

    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      clearStoredTokens();
      return false;
    }

    const body = await res.json().catch(() => ({}) as { access?: string });
    const currentRefreshToken =
      typeof window !== "undefined"
        ? localStorage.getItem("refresh_token")
        : null;

    if (!body.access || !currentRefreshToken) {
      clearStoredTokens();
      return false;
    }

    persistTokens(body.access, currentRefreshToken);
    return true;
  })();

  try {
    return await refreshRequest;
  } finally {
    refreshRequest = null;
  }
}

// Generic fetch wrapper
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  retryOnAuthFailure = true,
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: "include",
    });

    if (res.status === 401) {
      if (retryOnAuthFailure && (await refreshAccessToken())) {
        return apiFetch<T>(endpoint, options, false);
      }

      // Token invalid yoki refresh ishlamadi - tozalash va yo'naltirish
      if (typeof window !== "undefined") {
        clearStoredTokens();
        const pathname = window.location.pathname;
        if (pathname !== "/login") {
          window.location.replace("/login");
        }
      }
      return { error: { code: "UNAUTHORIZED", message: "Session expired" } };
    }

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      // DRF returns field errors as {field: ["error"]} or {detail: "error"}
      let message = body.detail || "";
      if (!message && typeof body === "object") {
        const fieldErrors = Object.entries(body)
          .filter(([key]) => key !== "error")
          .map(
            ([key, val]) =>
              `${key}: ${Array.isArray(val) ? val.join(", ") : val}`,
          )
          .join("; ");
        if (fieldErrors) message = fieldErrors;
      }
      return {
        error: body.error || {
          code: "API_ERROR",
          message: message || res.statusText,
        },
      };
    }

    return { data: body as T };
  } catch (err) {
    return {
      error: {
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Network error",
      },
    };
  }
}

// Auth API
export const authApi = {
  login: async (email: string, password: string) => {
    const res = await apiFetch<LoginResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res.data) {
      persistTokens(res.data.access, res.data.refresh);
    }
    return res;
  },

  logout: async (): Promise<LogoutResult> => {
    const token = getToken();

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });

      if (!res.ok && res.status !== 401) {
        const body = await res.json().catch(() => ({}));
        const message =
          body?.detail ||
          (Array.isArray(body?.error?.message)
            ? body.error.message.join(", ")
            : body?.error?.message) ||
          res.statusText;

        return {
          success: false,
          error: message || "Logout failed",
        };
      }
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Network error while logging out",
      };
    } finally {
      clearStoredTokens();
    }

    return { success: true };
  },

  me: () => apiFetch<User>("/api/v1/auth/me"),
};

// Catalog API
export const catalogApi = {
  list: (type?: CatalogType, params?: Record<string, string>) => {
    const searchParams = new URLSearchParams(params || {});
    if (type) searchParams.set("type", type);
    const query = searchParams.toString();
    const suffix = query ? `?${query}` : "";
    return apiFetch<PaginatedResponse<CatalogItem>>(
      `/api/v1/catalog/items/${suffix}`,
    );
  },

  get: (type: CatalogType, id: string) =>
    apiFetch<CatalogItem>(`/api/v1/catalog/items/${id}/`),

  create: (
    type: CatalogType,
    data: {
      name: string;
      name_uz?: string;
      name_ru?: string;
      name_en?: string;
      description?: string;
      meta?: Record<string, unknown>;
    },
  ) =>
    apiFetch<CatalogItem>("/api/v1/catalog/items/", {
      method: "POST",
      body: JSON.stringify({ type, ...data, metadata: data.meta }),
    }),

  update: (
    type: CatalogType,
    id: string,
    data: {
      name?: string;
      name_uz?: string;
      name_ru?: string;
      name_en?: string;
      description?: string;
      meta?: Record<string, unknown>;
    },
  ) =>
    apiFetch<CatalogItem>(`/api/v1/catalog/items/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({ ...data, metadata: data.meta }),
    }),

  delete: (type: CatalogType, id: string) =>
    apiFetch<void>(`/api/v1/catalog/items/${id}/`, {
      method: "DELETE",
    }),
};

// Bot1 Applications API
export const bot1Api = {
  // Admissions 2026
  listAdmissions: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<Admissions2026Application>>(
      `/api/v1/bot1/applications/admissions-2026/${query}`,
    );
  },
  getAdmission: (id: string) =>
    apiFetch<Admissions2026Application>(
      `/api/v1/bot1/applications/admissions-2026/${id}/`,
    ),

  // Campus Tour
  listCampusTours: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<CampusTourRequest>>(
      `/api/v1/bot1/applications/campus-tour/${query}`,
    );
  },
  getCampusTour: (id: string) =>
    apiFetch<CampusTourRequest>(`/api/v1/bot1/applications/campus-tour/${id}/`),

  // Foundation
  listFoundation: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<FoundationRequest>>(
      `/api/v1/bot1/applications/foundation/${query}`,
    );
  },
  getFoundation: (id: string) =>
    apiFetch<FoundationRequest>(`/api/v1/bot1/applications/foundation/${id}/`),

  // Polito Academy
  listPolito: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<PolitoAcademyRequest>>(
      `/api/v1/bot1/applications/polito-academy/${query}`,
    );
  },
  getPolito: (id: string) =>
    apiFetch<PolitoAcademyRequest>(
      `/api/v1/bot1/applications/polito-academy/${id}/`,
    ),

  // Applicants
  listApplicants: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<Bot1Applicant>>(
      `/api/v1/bot1/applicants/${query}`,
    );
  },
  getApplicant: (id: string) =>
    apiFetch<Bot1Applicant>(`/api/v1/bot1/applicants/${id}/`),
};

// Bot2 Survey API
export const bot2Api = {
  listSurveys: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<Bot2SurveyResponse>>(
      `/api/v1/bot2/surveys/${query}`,
    );
  },
  getSurvey: (id: string) =>
    apiFetch<Bot2SurveyResponse>(`/api/v1/bot2/surveys/${id}/`),

  listStudents: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<Bot2Student>>(
      `/api/v1/bot2/students/${query}`,
    );
  },
  getStudent: (id: string) =>
    apiFetch<Bot2Student>(`/api/v1/bot2/students/${id}/`),

  // Student Roster CRUD
  listRoster: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<StudentRoster>>(
      `/api/v1/bot2/roster/${query}`,
    );
  },
  getRoster: (id: string) =>
    apiFetch<StudentRoster>(`/api/v1/bot2/roster/${id}/`),

  createRoster: (data: Partial<StudentRoster>) =>
    apiFetch<StudentRoster>("/api/v1/bot2/roster/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateRoster: (id: string, data: Partial<StudentRoster>) =>
    apiFetch<StudentRoster>(`/api/v1/bot2/roster/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteRoster: (id: string) =>
    apiFetch<void>(`/api/v1/bot2/roster/${id}/`, {
      method: "DELETE",
    }),

  // Program Enrollment CRUD (aggregated totals)
  listEnrollments: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<ProgramEnrollment>>(
      `/api/v1/bot2/enrollments/${query}`,
    );
  },
  getEnrollment: (id: string) =>
    apiFetch<ProgramEnrollment>(`/api/v1/bot2/enrollments/${id}/`),
  createEnrollment: (data: Partial<ProgramEnrollment>) =>
    apiFetch<ProgramEnrollment>("/api/v1/bot2/enrollments/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateEnrollment: (id: string, data: Partial<ProgramEnrollment>) =>
    apiFetch<ProgramEnrollment>(`/api/v1/bot2/enrollments/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteEnrollment: (id: string) =>
    apiFetch<void>(`/api/v1/bot2/enrollments/${id}/`, {
      method: "DELETE",
    }),
};

// Analytics API
function _analyticsParams(opts?: {
  from?: string;
  to?: string;
  academicYear?: string;
}): string {
  const end = opts?.to || new Date(Date.now() + 400 * 86400000).toISOString();
  const start =
    opts?.from || new Date(Date.now() - 730 * 86400000).toISOString();
  const params = new URLSearchParams({ from: start, to: end });
  if (opts?.academicYear) params.set("academic_year", opts.academicYear);
  return params.toString();
}

export const analyticsApi = {
  getAcademicYears: () =>
    apiFetch<string[]>(`/api/v1/analytics/bot2/academic-years`),

  getCourseYearCoverage: (opts?: {
    from?: string;
    to?: string;
    academicYear?: string;
  }) =>
    apiFetch<
      Array<{
        course_year: number;
        total: number;
        responded: number;
        coverage_percent: number;
      }>
    >(`/api/v1/analytics/bot2/course-year-coverage?${_analyticsParams(opts)}`),

  getProgramCoverage: (opts?: {
    from?: string;
    to?: string;
    academicYear?: string;
  }) =>
    apiFetch<
      Array<{
        program_id: string;
        program_name: string;
        total: number;
        responded: number;
        coverage_percent: number;
      }>
    >(`/api/v1/analytics/bot2/program-coverage?${_analyticsParams(opts)}`),

  getProgramDetailsByYear: (
    courseYear: number,
    opts?: { from?: string; to?: string; academicYear?: string },
  ) =>
    apiFetch<
      Array<{
        program_id: string;
        program_name: string;
        total: number;
        responded: number;
        coverage_percent: number;
        employed: number;
        unemployed: number;
      }>
    >(
      `/api/v1/analytics/bot2/program-details-by-year?course_year=${courseYear}&${_analyticsParams(opts)}`,
    ),

  getEnrollmentOverview: (opts?: {
    from?: string;
    to?: string;
    academicYear?: string;
  }) =>
    apiFetch<{
      total_students: number;
      total_responded: number;
      coverage_percent: number;
      by_year: Array<{
        course_year: number;
        total: number;
        responded: number;
        coverage_percent: number;
      }>;
      by_program: Array<{
        program_id: string;
        program_name: string;
        course_year: number;
        total: number;
        responded: number;
        coverage_percent: number;
      }>;
    }>(`/api/v1/analytics/bot2/enrollments-overview?${_analyticsParams(opts)}`),
};

// Helper functions
export function getItemName(
  item: CatalogItem | CatalogItemNested | undefined,
  lang = "uz",
): string {
  if (!item) return "-";

  // Both CatalogItem and CatalogItemNested have name_uz, name_ru, name_en
  const langName = item[`name_${lang}` as keyof typeof item] as string;
  if (langName) return langName;

  // Fallback to name field
  if (item.name) return item.name;

  // Check metadata as last resort (for backward compatibility)
  const meta = (item as CatalogItem).metadata || (item as CatalogItem).meta;
  if (meta) {
    const metaName = meta[`name_${lang}`] as string;
    if (metaName) return metaName;
  }

  return item.code || "-";
}

// Get applicant full name
export function getApplicantName(applicant: Bot1Applicant | undefined): string {
  if (!applicant) return "-";
  const name = [applicant.first_name, applicant.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || applicant.username || `ID: ${applicant.telegram_user_id}`;
}

export function formatDate(date: string | null, includeTime = false): string {
  if (!date) return "-";
  const d = new Date(date);
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  };
  return d.toLocaleDateString("uz-UZ", options);
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: "Yangi",
    submitted: "Yuborilgan",
    in_progress: "Ko'rib chiqilmoqda",
    approved: "Tasdiqlangan",
    rejected: "Rad etilgan",
  };
  return labels[status] || status;
}

export function getGenderLabel(gender: string): string {
  const labels: Record<string, string> = {
    male: "Erkak",
    female: "Ayol",
    other: "Boshqa",
    unspecified: "Ko'rsatilmagan",
  };
  return labels[gender] || gender;
}
