export const EMPLOYMENT_LABELS: Record<string, string> = {
  employed: "Ha",
  unemployed: "Yo'q",
};

/* "Ishlaysizmi?" holatining to'liq (badge) yorlig'i */
export const EMPLOYMENT_STATUS_LABELS: Record<string, string> = {
  employed: "Ishlamoqda",
  unemployed: "Ishlamaydi",
};

export const GENDER_LABELS: Record<string, string> = {
  male: "Erkak",
  female: "Ayol",
  other: "Boshqa",
  unspecified: "—",
};

/* AI hujjat tekshiruvi — hujjat turlari (to'liq nom) */
export const DOC_TYPE_LABELS: Record<string, string> = {
  cv: "CV / Rezyume",
  ielts: "IELTS Sertifikati",
  certificate: "Sertifikat",
  diploma: "Diplom",
  employment: "Ish joyi ma'lumotnomasi",
  other: "Boshqa",
};

/* AI hujjat tekshiruvi — hujjat turlari (qisqa nom, jadval/tanlov uchun) */
export const DOC_TYPE_SHORT_LABELS: Record<string, string> = {
  cv: "CV",
  ielts: "IELTS",
  certificate: "Sertifikat",
  diploma: "Diplom",
  other: "Boshqa",
};

/* AI hujjat tekshiruvi — yakuniy qaror */
export const DECISION_LABELS: Record<string, string> = {
  pending: "Ko'rib chiqilmagan",
  accepted: "Tasdiqlandi",
  rejected: "Rad etildi",
};

/* AI hujjat tekshiruvi — jarayon holati */
export const AI_STATUS_LABELS: Record<string, string> = {
  pending: "Navbatda",
  processing: "Tahlil qilinmoqda",
  done: "Tayyor",
  failed: "Xatolik",
};

export const CONSENT_LABELS: Record<string, string> = {
  share_with_employers: "Ma'lumotlarni ish beruvchilarga ulashish",
  want_help: "Universitet ish topishda yordam bersinmi",
};

export const LABEL_TRANSLATIONS: Record<string, string> = {
  gender: "Jins",
  birth_date: "Tug'ilgan sana",
  year: "Kurs",
  group: "Guruh",
  direction: "Yo'nalish",
  satisfaction: "Qoniqish darajasi",
  feedback: "Fikr-mulohaza",
  rating: "Baho",
  dormitory: "Yotoqxona",
  transport: "Transport",
  food: "Ovqatlanish",
  library: "Kutubxona",
  sports: "Sport",
  wifi: "WiFi",
  cleanliness: "Tozalik",
  security: "Xavfsizlik",
  teachers: "O'qituvchilar",
  materials: "Materiallar",
  schedule: "Dars jadvali",
  facilities: "Jihozlar",
  comment: "Izoh",
  suggestion: "Taklif",
  complaint: "Shikoyat",
  question: "Savol",
  english_level: "Ingliz tili darajasi",
  russian_level: "Rus tili darajasi",
  region_label: "Viloyat (bot)",
  program_label: "Yo'nalish (bot)",
  course_year: "Kurs (bot)",
};

/* Kurs yorlig'i — yagona manba (lib/utils.ts formatCourseYearLabel shu yerga yo'naltiradi) */
export function courseYearLabel(year: number | null | undefined): string {
  if (!year) return "-";
  if (year === 5) return "Bitirgan";
  return `${year}-kurs`;
}

/* AI ajratgan qiymatni o'qishli matnga aylantiradi (massiv/obyektlar bilan birga) */
export function formatVal(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "Ha" : "Yo'q";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (Array.isArray(val)) return val.map(formatVal).filter(Boolean).join(", ");
  if (typeof val === "object") {
    return Object.values(val as Record<string, unknown>)
      .map(formatVal)
      .filter(Boolean)
      .join(" · ");
  }
  return String(val);
}
