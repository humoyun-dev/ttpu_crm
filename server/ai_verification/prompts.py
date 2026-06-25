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
- flags qiymatlari: ["no_photo", "incomplete_info", "suspicious_format", "blurry", "not_cv"]
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
- flags qiymatlari: ["low_score", "expired", "blurry", "not_ielts", "possibly_edited", "score_mismatch"]
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
- flags qiymatlari: ["blurry", "not_certificate", "possibly_edited", "expired", "missing_signature"]
"""

DIPLOMA_PROMPT = """
Quyidagi rasm diplom hujjati. Uni tahlil qil.

Faqat JSON formatida javob ber:

{
  "confidence_score": 0.0-1.0,
  "confidence_level": "green|yellow|red",
  "extracted_data": {
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
- flags qiymatlari: ["blurry", "not_diploma", "possibly_edited", "missing_seal"]
"""

# Prompt tanlash funksiyasi
PROMPT_MAP = {
    "cv": CV_PROMPT,
    "ielts": IELTS_PROMPT,
    "certificate": CERTIFICATE_PROMPT,
    "diploma": DIPLOMA_PROMPT,
    "other": CERTIFICATE_PROMPT,  # Fallback
}


def get_prompt(document_type: str) -> str:
    return PROMPT_MAP.get(document_type, CERTIFICATE_PROMPT)
