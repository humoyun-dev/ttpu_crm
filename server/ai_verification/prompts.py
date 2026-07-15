"""
Gemini uchun prompt shablonlari.
Barcha promptlar o'zbek tilida javob so'raydi.
Javob faqat JSON bo'lishi kerak — markdown yoki boshqa matn yo'q.
"""

CV_PROMPT = """
Quyidagi rasm CV (rezume) hujjati. Uni diqqat bilan tahlil qil.

Faqat JSON formatida javob ber (markdown yoki izoh yo'q):

{
  "confidence_score": 0.0-1.0,
  "confidence_level": "green|yellow|red",
  "extracted_data": {
    "document_name": "<hujjatda yozilgan ism yoki null>",
    "name_match": true,
    "full_name": "...",
    "email": "...",
    "phone": "...",
    "skills": ["...", "..."],
    "work_experience": [
      {"company": "...", "role": "...", "start": "...", "end": "..."}
    ],
    "education": [
      {"university": "...", "degree": "...", "year": "..."}
    ],
    "languages": [
      {"language": "...", "level": "..."}
    ]
  },
  "flags": [],
  "summary": "O'zbek tilida 2-3 jumlada xulosa."
}

Qoidalar:
- confidence_level: 0.75+ green, 0.45-0.75 yellow, <0.45 red
- flags qiymatlari: ["no_photo", "incomplete_info", "suspicious_format", "blurry", "not_cv", "name_mismatch", "name_variant"]
- Agar rasm CV emas bo'lsa: confidence_score = 0.1, flags = ["not_cv"]
- Agar rasm xiralashgan (blurry) bo'lsa: flags ga "blurry" qo'sh
- Hech qachon o'zing ma'lumot to'ldirma — faqat hujjatda ko'ringanini yoz
- Telefon/email ko'rinmasa: null qo'y
"""

IELTS_PROMPT = """
Quyidagi rasm IELTS sertifikati. Uni diqqat bilan tahlil qil.

Faqat JSON formatida javob ber:

{
  "confidence_score": 0.0-1.0,
  "confidence_level": "green|yellow|red",
  "extracted_data": {
    "document_name": "<hujjatda yozilgan ism yoki null>",
    "name_match": true,
    "candidate_name": "...",
    "test_date": "...",
    "overall_band": "...",
    "listening": "...",
    "reading": "...",
    "writing": "...",
    "speaking": "...",
    "certificate_number": "...",
    "test_type": "Academic|General Training|unknown"
  },
  "flags": [],
  "summary": "O'zbek tilida 2-3 jumlada xulosa."
}

Qoidalar:
- confidence_level: 0.75+ green, 0.45-0.75 yellow, <0.45 red
- test_date YYYY-MM-DD formatida bo'lsin
- flags qiymatlari: ["low_score", "expired", "blurry", "not_ielts", "possibly_edited", "score_mismatch", "name_mismatch", "name_variant"]
- Band scores 0-9 oralig'ida bo'lishi kerak — boshqacha bo'lsa: flags ga "score_mismatch" qo'sh
- Sertifikat 2 yildan eski bo'lsa: flags ga "expired" qo'sh
- Pixel darajasidagi tahrir belgilari bo'lsa: flags ga "possibly_edited" qo'sh
- Agar rasm IELTS sertifikati emas bo'lsa: confidence_score = 0.1, flags = ["not_ielts"]
"""

CERTIFICATE_PROMPT = """
Quyidagi rasm sertifikat hujjati. Uni tahlil qil.

Faqat JSON formatida javob ber:

{
  "confidence_score": 0.0-1.0,
  "confidence_level": "green|yellow|red",
  "extracted_data": {
    "document_name": "<hujjatda yozilgan ism yoki null>",
    "name_match": true,
    "recipient_name": "...",
    "issuing_organization": "...",
    "certificate_title": "...",
    "issue_date": "...",
    "expiry_date": "...",
    "certificate_number": "..."
  },
  "flags": [],
  "summary": "O'zbek tilida 2-3 jumlada xulosa."
}

Qoidalar:
- confidence_level: 0.75+ green, 0.45-0.75 yellow, <0.45 red
- issue_date YYYY-MM-DD yoki "unknown"; expiry_date null agar muddatsiz; certificate_number null agar ko'rinmasa
- flags qiymatlari: ["blurry", "not_certificate", "possibly_edited", "expired", "missing_signature", "name_mismatch", "name_variant"]
"""

DIPLOMA_PROMPT = """
Quyidagi rasm diplom hujjati. Uni tahlil qil.

Faqat JSON formatida javob ber:

{
  "confidence_score": 0.0-1.0,
  "confidence_level": "green|yellow|red",
  "extracted_data": {
    "document_name": "<hujjatda yozilgan ism yoki null>",
    "name_match": true,
    "graduate_name": "...",
    "university_name": "...",
    "degree": "...",
    "major": "...",
    "graduation_year": "...",
    "diploma_number": "..."
  },
  "flags": [],
  "summary": "O'zbek tilida 2-3 jumlada xulosa."
}

Qoidalar:
- confidence_level: 0.75+ green, 0.45-0.75 yellow, <0.45 red
- degree: Bakalavr, Magistr va h.k.; diploma_number null agar ko'rinmasa
- flags qiymatlari: ["blurry", "not_diploma", "possibly_edited", "missing_seal", "name_mismatch", "name_variant"]
"""

EMPLOYMENT_PROMPT = """
Quyidagi rasm ish joyi ma'lumotnomasi, mehnat shartnomasi yoki ishga qabul qilish hujjati. Uni tahlil qil.

Faqat JSON formatida javob ber:

{
  "confidence_score": 0.0-1.0,
  "confidence_level": "green|yellow|red",
  "extracted_data": {
    "document_name": "<hujjatda yozilgan ism yoki null>",
    "name_match": true,
    "employee_name": "...",
    "employer_name": "...",
    "position": "...",
    "employment_type": "full_time|part_time|contract|unknown",
    "start_date": "...",
    "issue_date": "...",
    "document_number": "..."
  },
  "flags": [],
  "summary": "O'zbek tilida 2-3 jumlada xulosa."
}

Qoidalar:
- confidence_level: 0.75+ green, 0.45-0.75 yellow, <0.45 red
- Agar hujjat ish joyi ma'lumotnomasi emas bo'lsa: confidence_score = 0.1, flags = ["not_employment_doc"]
- Muhr (stamp/seal) ko'rinmasa: flags ga "missing_seal" qo'sh
- Imzo ko'rinmasa: flags ga "missing_signature" qo'sh
- Tahrir belgilari bo'lsa: flags ga "possibly_edited" qo'sh
- Agar rasm xiralashgan bo'lsa: flags ga "blurry" qo'sh
- flags qiymatlari: ["not_employment_doc", "missing_seal", "missing_signature", "possibly_edited", "blurry", "expired", "name_mismatch", "name_variant"]
"""

# Prompt tanlash funksiyasi
PROMPT_MAP = {
    "cv": CV_PROMPT,
    "ielts": IELTS_PROMPT,
    "certificate": CERTIFICATE_PROMPT,
    "diploma": DIPLOMA_PROMPT,
    "employment": EMPLOYMENT_PROMPT,
    "other": CERTIFICATE_PROMPT,  # Fallback
}


def _name_check_block(student_name: str) -> str:
    """Talaba ismini Gemini ga beruvchi, hujjatdagi ism bilan solishtiruvchi qo'shimcha ko'rsatma."""
    return f"""

=== ISM MOSLIK TEKSHIRUVI (MAJBURIY) ===
Tizimda ro'yxatdan o'tgan talaba ismi: "{student_name}"
Hujjatdagi ismni bu ism bilan qat'iy solishtir.

extracted_data ga ALBATTA qo'sh:
  "document_name": "<hujjatda aniq ko'ringan ism yoki null>",
  "name_match": <true yoki false>

MOSLIK QOIDALARI — quyidagi holatlarda name_match: TRUE:
1. To'liq moslik yoki 1-2 harfli imlo xatosi (Humoyun / Humoyn)
2. Lotin ↔ Kirill farqi (Humoyun = Хумоюн = Humoyon)
3. Transliteratsiya varianti (Tursunov / Tursunniyazov, Yusuf / Yusup, Mirzo / Mirza)
4. Ism va familiya tartibi teskari (Tursunov Humoyun = Humoyun Tursunov)
5. Faqat birinchi harf qisqartirilgan (H. Tursunov = Humoyun Tursunov)
6. Otasining ismi (patronim) hujjatda bor, tizimda yo'q — bu normaldagi farq
7. Bosh harf/kichik harf farqi yoki bo'shliq farqi

MOSLIK QOIDALARI — quyidagi holatlarda name_match: FALSE:
- Butunlay boshqa ism (Alibek vs Humoyun)
- Familiya butunlay boshqa va mos kelmaydi

BAYROQLAR (flags):
- name_match: false → flags ga "name_mismatch" MAJBURIY qo'sh, confidence_score = 0.10
- name_match: true lekin kichik farq (3,4,6,7 qoidalar) → flags ga "name_variant" qo'sh (confidence ta'sir etmaydi)
- name_match: true va to'liq moslik (1,2 qoidalar) → hech qanday ism bayrog'i qo'shma
=== ISM TEKSHIRUVI TUGADI ===
"""


def get_prompt(document_type: str, student_name: str = "") -> str:
    base = PROMPT_MAP.get(document_type, CERTIFICATE_PROMPT)
    if student_name.strip():
        return base + _name_check_block(student_name)
    return base
