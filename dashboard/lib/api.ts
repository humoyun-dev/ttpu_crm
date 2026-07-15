// API client for TTPU CRM Dashboard

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9006";
const AUTH_MARKER_COOKIE = "dashboard_auth";
const AUTH_MARKER_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string | string[];
    /** HTTP status (mavjud bo'lsa) — masalan 404 "Invalid page" ni ajratish uchun. */
    status?: number;
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
  | "subject"
  | "other";

export interface CatalogTypeInfo {
  value: CatalogType;
  label: string;
  description: string;
  requiresMetadata: boolean;
  metadataFields?: Record<string, { required: boolean; type: string }>;
}

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

export const CATALOG_TYPES_INFO: CatalogTypeInfo[] = [
  {
    value: "direction",
    label: "Yo'nalishlar",
    description: "Ta'lim yo'nalishlari",
    requiresMetadata: false,
  },
  {
    value: "region",
    label: "Hududlar",
    description: "Viloyatlar va shaharlar",
    requiresMetadata: false,
  },
];

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

// Bot2 Survey
export type DocVerificationStatus = "verified" | "pending" | "rejected" | "no_docs";

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
  doc_verification_status: DocVerificationStatus;
}

export interface Bot2Document {
  id: string;
  doc_type: "cv" | "certificate" | "employment";
  original_filename: string;
  mime_type: string;
  file_size: number | null;
  file_url: string;
  created_at: string;
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
  language?: string;
  ai_skills?: AiSkills;
  ai_skills_at?: string | null;
  // Yengil list serializer maydonlari (talaba tanlagich uchun):
  program_name?: string | null;
  course_year?: number | null;
  doc_verified?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface AiSkills {
  skills?: string[];
  languages?: string[];
  experience_summary?: string;
  level?: string;
  education?: string;
}

export interface StudentRoster {
  id: string;
  student_external_id: string;
  first_name: string;
  last_name: string;
  roster_campaign: string;
  program: string | null;
  program_details?: CatalogItemNested;
  course_year: number | null;
  is_active: boolean;
  birth_date: string | null;
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
    name_uz?: string;
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
export function getToken(): string | null {
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
  // For FormData bodies, let the browser set Content-Type (with the multipart
  // boundary). Setting it manually would break the multipart request.
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: HeadersInit = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
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

      if (typeof window !== "undefined") {
        clearStoredTokens();
        const pathname = window.location.pathname;
        // Ommaviy sahifalarda (/login, /l/<token>) redirect qilinmaydi —
        // ish beruvchi havolasi login talab qilmaydi.
        const isPublicPath =
          pathname === "/login" ||
          pathname === "/l" ||
          pathname.startsWith("/l/");
        if (!isPublicPath) {
          window.location.replace("/login");
        }
      }
      return { error: { code: "UNAUTHORIZED", message: "Session expired" } };
    }

    // Muvaffaqiyatli javob + token HALI mavjud — dashboard_auth marker cookie'sini
    // qayta o'rnatamiz (cookie o'chib ketgan bo'lsa ham localStorage'dagi token
    // amal qiladi; aks holda proxy /login <-> /dashboard siklini keltirib chiqaradi).
    // DIQQAT: getToken()'ni javob PAYTIDA qayta o'qiymiz — so'rov davomida logout
    // bo'lgan bo'lsa (tokenlar tozalangan), eski token bilan marker'ni tiriltirmaymiz.
    if (res.ok && getToken()) {
      setAuthMarkerCookie(true);
    }

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
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
        error: {
          ...(body.error || { code: "API_ERROR", message: message || res.statusText }),
          status: res.status,
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

// Autentifikatsiyalangan fayl yuklab olish: Bearer token bilan so'raladi,
// 401 bo'lsa apiFetch kabi bir marta refresh qilib qayta urinadi, blob'ni
// brauzer yuklab olishiga uzatadi. Xatoda { error } qaytaradi.
export async function downloadFile(
  path: string,
  filename?: string,
): Promise<{ error?: string }> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const doFetch = () => {
    const token = getToken();
    return fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    });
  };

  try {
    let res = await doFetch();

    if (res.status === 401 && (await refreshAccessToken())) {
      res = await doFetch();
    }

    if (res.status === 401) {
      return { error: "Sessiya muddati tugagan. Qaytadan kiring." };
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        detail?: string;
        error?: { message?: string | string[] };
      };
      const message =
        body.detail ||
        (Array.isArray(body.error?.message)
          ? body.error.message.join(", ")
          : body.error?.message);
      return {
        error: message || `Yuklab olishda xatolik (${res.status})`,
      };
    }

    const blob = await res.blob();

    let name = filename;
    if (!name) {
      const disposition = res.headers.get("content-disposition") || "";
      const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
      if (match) {
        try {
          name = decodeURIComponent(match[1].replace(/"/g, "").trim());
        } catch {
          name = match[1].replace(/"/g, "").trim();
        }
      }
    }
    if (!name) {
      const cleanPath = url.split("?")[0].replace(/\/+$/, "");
      name = cleanPath.slice(cleanPath.lastIndexOf("/") + 1) || "download";
    }

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Yuklab olish boshlangach obyekt URL'ni bo'shatamiz.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Tarmoq xatosi",
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
      code?: string;
      meta?: Record<string, unknown>;
    },
  ) => {
    const { meta, ...rest } = data;
    return apiFetch<CatalogItem>("/api/v1/catalog/items/", {
      method: "POST",
      body: JSON.stringify({ type, ...rest, metadata: meta }),
    });
  },

  update: (
    type: CatalogType,
    id: string,
    data: {
      name?: string;
      name_uz?: string;
      name_ru?: string;
      name_en?: string;
      code?: string;
      meta?: Record<string, unknown>;
    },
  ) => {
    const { meta, ...rest } = data;
    return apiFetch<CatalogItem>(`/api/v1/catalog/items/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({ ...rest, metadata: meta }),
    });
  },

  delete: (type: CatalogType, id: string) =>
    apiFetch<void>(`/api/v1/catalog/items/${id}/`, {
      method: "DELETE",
    }),
};

// Roster import
export interface RosterImportedStudent {
  row: number;
  student_external_id: string;
  first_name: string;
  last_name: string;
  course_year: number | null;
  program: string | null;
  status: "created" | "updated";
}

export interface RosterImportResult {
  created: number;
  updated: number;
  /** ID'siz o'tkazib yuborilgan qatorlar (statistika jadvali qoldiqlari, bo'sh qatorlar). */
  skipped?: number;
  errors: { row: number; error: string }[];
  students: RosterImportedStudent[];
}

export const rosterApi = {
  import: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<RosterImportResult>("/api/v1/admin/roster/import", {
      method: "POST",
      body: form,
    });
  },
};

// Bot2 API
export const bot2Api = {
  listSurveys: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<Bot2SurveyResponse>>(
      `/api/v1/bot2/surveys/${query}`,
    );
  },
  getSurvey: (id: string) =>
    apiFetch<Bot2SurveyResponse>(`/api/v1/bot2/surveys/${id}/`),

  updateSurvey: (id: string, data: Partial<Bot2SurveyResponse>) =>
    apiFetch<Bot2SurveyResponse>(`/api/v1/bot2/surveys/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Har bir talabaning ENG OXIRGI so'rovnomasi bo'yicha statistika
  surveyStats: () =>
    apiFetch<{ unique_students: number; employed: number; unemployed: number }>(
      "/api/v1/bot2/surveys/stats",
    ),

  listStudents: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<Bot2Student>>(
      `/api/v1/bot2/students/${query}`,
    );
  },
  getStudent: (id: string) =>
    apiFetch<Bot2Student>(`/api/v1/bot2/students/${id}/`),

  updateStudent: (id: string, data: Partial<Bot2Student>) =>
    apiFetch<Bot2Student>(`/api/v1/bot2/students/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  extractSkills: (id: string) =>
    apiFetch<{ detail: string }>(`/api/v1/bot2/students/${id}/extract-skills`, {
      method: "POST",
    }),

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

  listDocuments: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<Bot2Document>>(`/api/v1/bot2/documents/${query}`);
  },

  documentDownloadUrl: (docId: string) =>
    `${API_BASE}/api/v1/bot2/documents/${docId}/download/`,
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

  surveyInsights: () =>
    apiFetch<{
      summary: string;
      themes: { title: string; description: string }[];
      recommendations: string[];
      error?: string;
    }>(`/api/v1/analytics/survey-insights`, { method: "POST" }),
};

// ── AI xarajat kuzatuvi (Gemini) ──────────────────────────────────────────────

export interface AIUsageSummary {
  total_cost_usd: string;
  total_tokens: number;
  total_requests: number;
  this_month_cost_usd: string;
  today_cost_usd: string;
  avg_cost_per_request: string;
  by_model: Array<{
    model_name: string;
    cost: string;
    tokens: number;
    requests: number;
  }>;
}

export interface AIUsageDaily {
  days: Array<{ date: string; cost_usd: string; requests: number; tokens: number }>;
}

export interface AIUsageEstimate {
  docs_per_day: number;
  estimated_monthly_cost_usd: string;
  model: string;
}

export const aiCostApi = {
  getSummary: () =>
    apiFetch<AIUsageSummary>(`/api/v1/ai-verification/usage/summary`),
  getDaily: (days = 30) =>
    apiFetch<AIUsageDaily>(`/api/v1/ai-verification/usage/daily?days=${days}`),
  getEstimate: (docsPerDay = 50) =>
    apiFetch<AIUsageEstimate>(
      `/api/v1/ai-verification/usage/estimate?docs_per_day=${docsPerDay}`,
    ),
};

// ── AI hujjat tekshiruvi (Gemini) ─────────────────────────────────────────────

export type AIDocumentType = "cv" | "ielts" | "certificate" | "diploma" | "other";
export type AIConfidence = "green" | "yellow" | "red";
export type AIDecision = "pending" | "accepted" | "rejected";
export type AIVerifyStatus = "pending" | "processing" | "done" | "failed";

export interface DocumentVerification {
  id: string;
  student: string;
  student_name: string;
  document_type: AIDocumentType;
  file_name: string;
  mime_type: string;
  status: AIVerifyStatus;
  confidence_level: AIConfidence | null;
  confidence_score: number | null;
  extracted_data: Record<string, unknown>;
  flags: string[];
  ai_summary: string;
  processed_at: string | null;
  error_message: string;
  uploaded_by: string | null;
  uploaded_by_name: string;
  reviewed_by: string | null;
  reviewed_by_name: string;
  reviewed_at: string | null;
  review_note: string;
  final_decision: AIDecision;
  created_at: string;
  updated_at: string;
}

export interface AIVerifyStats {
  total: number;
  by_confidence: { green: number; yellow: number; red: number; none: number };
  by_decision: { pending: number; accepted: number; rejected: number };
  by_status: { done: number; processing: number; pending: number; failed: number };
}

export const aiVerifyApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<DocumentVerification>>(
      `/api/v1/ai-verification/${q}`,
    );
  },
  getStats: () => apiFetch<AIVerifyStats>(`/api/v1/ai-verification/stats`),
  detail: (id: string) =>
    apiFetch<DocumentVerification>(`/api/v1/ai-verification/${id}`),
  retry: (id: string) =>
    apiFetch<DocumentVerification>(`/api/v1/ai-verification/${id}/retry`, {
      method: "POST",
    }),
  review: (
    id: string,
    body: { final_decision?: AIDecision; confidence_level?: AIConfidence; review_note?: string },
  ) =>
    apiFetch<DocumentVerification>(`/api/v1/ai-verification/${id}/review`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  byStudent: (studentId: string, surveyId?: string) => {
    const q = surveyId ? `?survey=${surveyId}` : "";
    return apiFetch<DocumentVerification[]>(`/api/v1/ai-verification/student/${studentId}${q}`);
  },
  submit: (studentId: string, docType: AIDocumentType, file: File) => {
    const form = new FormData();
    form.append("student_id", studentId);
    form.append("document_type", docType);
    form.append("file", file);
    return apiFetch<DocumentVerification>(`/api/v1/ai-verification/submit`, {
      method: "POST",
      body: form,
    });
  },
};

// Helper functions
export function getItemName(
  item: CatalogItem | CatalogItemNested | undefined,
  lang = "uz",
): string {
  if (!item) return "-";

  const langName = item[`name_${lang}` as keyof typeof item] as string;
  if (langName) return langName;

  if (item.name) return item.name;

  const meta = (item as CatalogItem).metadata || (item as CatalogItem).meta;
  if (meta) {
    const metaName = meta[`name_${lang}`] as string;
    if (metaName) return metaName;
  }

  return item.code || "-";
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

export function getGenderLabel(gender: string): string {
  const labels: Record<string, string> = {
    male: "Erkak",
    female: "Ayol",
    other: "Boshqa",
    unspecified: "Ko'rsatilmagan",
  };
  return labels[gender] || gender;
}

// ── New types ──────────────────────────────────────────────────────────────

export type MouStatus = "negotiating" | "signed" | "expired";
export type LeadStatus = "created" | "sent" | "viewing" | "selected" | "closed";
export type DocumentType = "CV" | "IELTS" | "CERT" | "OTHER";
export type DocumentStatus = "pending" | "verified" | "flagged";
export type FollowUpStage = "pending" | "contacted" | "interviewed" | "done";

export interface Employer {
  id: string;
  name: string;
  industry: string | null;
  industry_name: string | null;
  location: string;
  logo: string | null;
  description: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  mou_status: MouStatus;
  created_at: string;
  updated_at: string;
}

export interface LeadStudent {
  id: string;
  lead: string;
  student: string;
  student_external_id: string;
  student_name: string;
  employer_interested: boolean;
  forwarded: boolean;
  ai_summary?: string;
  ai_summary_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccessLink {
  id: string;
  token: string;
  expires_at: string;
  revoked: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  employer: string;
  employer_name: string;
  title: string;
  status: LeadStatus;
  notes: string;
  created_by: string | null;
  lead_students: LeadStudent[];
  access_link: AccessLink | null;
  created_at: string;
  updated_at: string;
}

export type InternshipStatus = "pending" | "approved" | "rejected";

export interface InternshipRequest {
  id: string;
  student: string;
  student_name: string;
  student_external_id: string;
  student_phone: string;
  employer: string | null;
  employer_name: string | null;
  company_name: string;
  note: string;
  status: InternshipStatus;
  status_display: string;
  staff_comment: string;
  reviewed_by: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  student: string;
  student_external_id: string;
  type: DocumentType;
  status: DocumentStatus;
  ai_result: Record<string, unknown> | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentsByDirectionRow {
  program_id: string;
  program_name: string;
  total: number;
  registered: number;
  employed: number;
  registered_pct: number;
  employed_pct: number;
}

// ── Employer API ───────────────────────────────────────────────────────────

export const employerApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<Employer>>(`/api/v1/employers/${q}`);
  },
  get: (id: string) => apiFetch<Employer>(`/api/v1/employers/${id}/`),
  create: (data: Partial<Employer>) =>
    apiFetch<Employer>("/api/v1/employers/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Employer>) =>
    apiFetch<Employer>(`/api/v1/employers/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/api/v1/employers/${id}/`, { method: "DELETE" }),
};

// ── Lead API ───────────────────────────────────────────────────────────────

export const leadApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<Lead>>(`/api/v1/leads/${q}`);
  },
  get: (id: string) => apiFetch<Lead>(`/api/v1/leads/${id}/`),
  create: (data: Partial<Lead> & { student_ids?: string[] }) =>
    apiFetch<Lead>("/api/v1/leads/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Lead>) =>
    apiFetch<Lead>(`/api/v1/leads/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  send: (id: string) =>
    apiFetch<AccessLink>(`/api/v1/leads/${id}/send/`, { method: "POST" }),
  addStudents: (leadId: string, studentIds: string[]) =>
    apiFetch<Lead>(`/api/v1/leads/${leadId}/add_students/`, {
      method: "POST",
      body: JSON.stringify({ student_ids: studentIds }),
    }),
  generateSummaries: (leadId: string) =>
    apiFetch<{ detail: string; count: number }>(`/api/v1/leads/${leadId}/generate_summaries/`, {
      method: "POST",
      body: JSON.stringify({ force: true }),
    }),
  matchCandidates: (requirement: string, studentIds: string[]) =>
    apiFetch<{ ranked: { student_id: string; score: number; reason: string }[] }>(
      "/api/v1/leads/match_candidates/", {
        method: "POST",
        body: JSON.stringify({ requirement, student_ids: studentIds }),
      }),
};

// ── Internship (Amaliyot) API ──────────────────────────────────────────────

export const internshipApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<InternshipRequest>>(`/api/v1/internships/${q}`);
  },
  get: (id: string) => apiFetch<InternshipRequest>(`/api/v1/internships/${id}/`),
  review: (id: string, status: "approved" | "rejected", staffComment = "") =>
    apiFetch<InternshipRequest>(`/api/v1/internships/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({ status, staff_comment: staffComment }),
    }),
};

// ── Document API ───────────────────────────────────────────────────────────

export const documentApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<PaginatedResponse<Document>>(`/api/v1/documents/${q}`);
  },
  review: (id: string, status: DocumentStatus) =>
    apiFetch<Document>(`/api/v1/documents/${id}/review/`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};

// ── Report API ─────────────────────────────────────────────────────────────

export const reportApi = {
  studentsByDirection: () =>
    apiFetch<StudentsByDirectionRow[]>("/api/v1/analytics/students-by-direction"),
  xlsxUrl: () =>
    `${API_BASE}/api/v1/analytics/students-by-direction.xlsx`,
};

// ── Public access-link API (no auth) ──────────────────────────────────────

export interface AccessLinkStudentDoc {
  id: string;
  type: string;       // "cv" | "certificate"
  filename: string;
  url: string;        // token bilan himoyalangan (yangi tabda ochiladi)
}

export interface AccessLinkStudent {
  lead_student_id: string;
  student_external_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  program: string | null;
  course: number | null;
  region: string | null;
  phone: string | null;
  shared: boolean;
  employer_interested: boolean;
  ai_summary: string;
  ai_profile?: AiCandidateProfile | null;
  documents: AccessLinkStudentDoc[];
}

export interface AiCandidateProfile {
  headline: string;
  education: string;
  skills: string[];
  languages: string[];
  experience: string[];
  fit: string;
}

export interface AccessLinkPublic {
  lead_id: string;
  title: string;
  employer: string;
  students: AccessLinkStudent[];
}

export async function fetchAccessLink(token: string): Promise<ApiResponse<AccessLinkPublic>> {
  try {
    const res = await fetch(`${API_BASE}/l/${token}/`, {
      headers: { "Content-Type": "application/json" },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: body.error || { code: "ERROR", message: res.statusText } };
    }
    return { data: body as AccessLinkPublic };
  } catch (err) {
    return { error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Network error" } };
  }
}

export async function askAccessLink(token: string, leadStudentId: string, question: string): Promise<ApiResponse<{ answer: string }>> {
  try {
    const res = await fetch(`${API_BASE}/l/${token}/ask/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_student_id: leadStudentId, question }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: body.error || { code: "ERROR", message: res.statusText } };
    return { data: body as { answer: string } };
  } catch (err) {
    return { error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Network error" } };
  }
}

export async function submitAccessLinkInterest(token: string, leadStudentId: string): Promise<ApiResponse<unknown>> {
  try {
    const res = await fetch(`${API_BASE}/l/${token}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_student_id: leadStudentId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: body.error || { code: "ERROR", message: res.statusText } };
    }
    return { data: body };
  } catch (err) {
    return { error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Network error" } };
  }
}

// ── Label helpers ──────────────────────────────────────────────────────────

export const MOU_STATUS_LABELS: Record<MouStatus, string> = {
  negotiating: "Muzokaralar",
  signed: "Imzolangan",
  expired: "Muddati o'tgan",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  created: "Yaratildi",
  sent: "Yuborildi",
  viewing: "Ko'rilmoqda",
  selected: "Tanlandi",
  closed: "Yopildi",
};

export const INTERNSHIP_STATUS_LABELS: Record<InternshipStatus, string> = {
  pending: "Ko'rib chiqilmoqda",
  approved: "Tasdiqlandi",
  rejected: "Rad etildi",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CV: "CV",
  IELTS: "IELTS",
  CERT: "Sertifikat",
  OTHER: "Boshqa",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: "Kutilmoqda",
  verified: "Tasdiqlangan",
  flagged: "Belgilangan",
};

// ── Vacancies ──────────────────────────────────────────────────────────────

export type VacancyStatus = "draft" | "published" | "closed" | "archived";
export type VacancyEmploymentType = "full_time" | "part_time" | "internship" | "contract" | "remote";
export type VacancyWorkFormat = "onsite" | "remote" | "hybrid" | "";

export interface Vacancy {
  id: string;
  title: string;
  company_name: string;
  description: string;
  requirements: string;
  employment_type: VacancyEmploymentType;
  employment_type_display: string;
  work_format: VacancyWorkFormat;
  work_format_display: string;
  schedule: string;
  experience: string;
  tags: string;
  address: string;
  image: string | null;
  image_url: string | null;
  region: string | null;
  region_name: string | null;
  direction: string | null;
  direction_name: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  apply_url: string;
  apply_contact: string;
  deadline: string | null;
  status: VacancyStatus;
  created_by: string | null;
  created_by_name: string;
  published_at: string | null;
  view_count: number;
  is_posted: boolean;
  channel_status: "not_posted" | "synced" | "pending" | "failed";
  created_at: string;
  updated_at: string;
}

export interface VacancyWrite {
  title: string;
  company_name: string;
  description: string;
  requirements?: string;
  employment_type: VacancyEmploymentType;
  work_format?: VacancyWorkFormat;
  schedule?: string;
  experience?: string;
  tags?: string;
  address?: string;
  region?: string | null;
  direction?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  apply_url?: string;
  apply_contact?: string;
  deadline?: string | null;
}

export const vacancyApi = {
  list: (params?: { status?: string; employment_type?: string }) => {
    const q = params
      ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString()
      : "";
    return apiFetch<Vacancy[]>(`/api/v1/vacancies/${q}`);
  },
  get: (id: string) => apiFetch<Vacancy>(`/api/v1/vacancies/${id}`),
  create: (data: VacancyWrite) =>
    apiFetch<Vacancy>("/api/v1/vacancies/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<VacancyWrite>) =>
    apiFetch<Vacancy>(`/api/v1/vacancies/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  publish: (id: string) =>
    apiFetch<Vacancy>(`/api/v1/vacancies/${id}/publish`, { method: "POST" }),
  delete: (id: string) =>
    apiFetch<void>(`/api/v1/vacancies/${id}`, { method: "DELETE" }),
  uploadImage: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("image", file);
    return apiFetch<Vacancy>(`/api/v1/vacancies/${id}/upload_image`, { method: "PATCH", body: fd });
  },
  aiDraft: (brief: string) =>
    apiFetch<{ description_html: string; requirements_html: string; tags: string }>(
      "/api/v1/vacancies/ai_draft", { method: "POST", body: JSON.stringify({ brief }) }),
};

export const VACANCY_STATUS_LABELS: Record<VacancyStatus, string> = {
  draft: "Qoralama",
  published: "E'lon qilingan",
  closed: "Yopilgan",
  archived: "Arxivlangan",
};

export const VACANCY_TYPE_LABELS: Record<VacancyEmploymentType, string> = {
  full_time: "To'liq stavka",
  part_time: "Yarim stavka",
  internship: "Amaliyot",
  contract: "Shartnoma",
  remote: "Masofaviy",
};

export const VACANCY_FORMAT_LABELS: Record<string, string> = {
  onsite: "Ofisda",
  remote: "Masofaviy",
  hybrid: "Aralash",
};
