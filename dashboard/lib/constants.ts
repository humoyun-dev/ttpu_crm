export const EMPLOYMENT_LABELS: Record<string, string> = {
  employed: "Ha",
  unemployed: "Yo'q",
};

export const GENDER_LABELS: Record<string, string> = {
  male: "Erkak",
  female: "Ayol",
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
};

export function courseYearLabel(year: number | null | undefined): string {
  if (!year) return "-";
  if (year === 5) return "Bitirgan";
  return `${year}-kurs`;
}
