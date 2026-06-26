// API client for TTPU CRM Dashboard

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9006";
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
export type DocVerificationStatus = "verified" | "pending" | "no_docs";

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
  created_at: string;
  updated_at: string;
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
        if (pathname !== "/login") {
          window.location.replace("/login");
        }
      }
      return { error: { code: "UNAUTHORIZED", message: "Session expired" } };
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
  create: (data: Partial<Lead>) =>
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
  addStudent: (leadId: string, studentExternalId: string) =>
    apiFetch<LeadStudent>(`/api/v1/leads/${leadId}/students/`, {
      method: "POST",
      body: JSON.stringify({ student_external_id: studentExternalId }),
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

export interface AccessLinkPublic {
  employer_name: string;
  lead_title: string;
  lead_status: LeadStatus;
  students: Array<{
    id: string;
    student_external_id: string;
    first_name: string;
    last_name: string;
    gender: string;
    documents: Array<{ type: DocumentType; status: DocumentStatus }>;
    employer_interested: boolean;
    forwarded: boolean;
  }>;
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

export async function submitAccessLinkInterest(token: string): Promise<ApiResponse<unknown>> {
  try {
    const res = await fetch(`${API_BASE}/l/${token}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
