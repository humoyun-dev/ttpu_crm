PROMPTS = {
    "uz": {
        # Language selection (shown before any lang is chosen — always Uzbek)
        "ask_language": "Tilni tanlang / Выберите язык:",
        # Verification
        "verify_intro": "Davom etish uchun tizimda topishimiz kerak.",
        "ask_student_id": "Talaba ID raqamingizni kiriting:",
        "ask_birth_date": "Tug'ilgan kuningizni kiriting (KK.OO.YYYY):",
        "birth_date_invalid": "Noto'g'ri format. Iltimos KK.OO.YYYY ko'rinishida kiriting (masalan: 15.04.2002):",
        "verify_success": "Tasdiqlandi ✅",
        "verify_failed": "Talaba topilmadi. ID yoki tug'ilgan kun noto'g'ri.\nQayta urinib ko'ring yoki /cancel bosing.",
        "verify_error": "Tekshirishda xatolik yuz berdi. Keyinroq urinib ko'ring.",
        # Consent
        "consent_text": (
            "Roʻyxatdan oʻtish uchun quyidagi shartlarga roziligingizni bildiring:\n\n"
            "📋 Shaxsiy ma'lumotlaringiz bandlik markazi tomonidan ishlanadi\n"
            "📊 Ma'lumotlar ish beruvchilarga taqdim etilishi mumkin\n\n"
            "Rozimisiz?"
        ),
        "consent_yes": "✅ Roziman",
        "consent_no": "❌ Rad etaman",
        "consent_declined": "Rozilik berilmadi. Xizmatdan foydalanish uchun rozilik talab etiladi.\nQaytadan /start bosing.",
        "register_error": "Ro'yxatdan o'tishda xatolik. Keyinroq urinib ko'ring.",
        # Survey steps
        "ask_contact": "Telefon raqamingizni ulashing:",
        "contact_button": "📱 Raqamni ulashish",
        "ask_first": "Ismingizni kiriting:",
        "ask_last": "Familiyangizni kiriting:",
        "ask_gender": "Jinsingizni tanlang:",
        "gender_male": "👨 Erkak",
        "gender_female": "👩 Ayol",
        "ask_region": "Hududingizni tanlang:",
        "ask_employment": "Hozirda ishlaysizmi?",
        "yes": "✅ Ha",
        "no": "❌ Yo'q",
        "ask_company": "Qaysi kompaniyada ishlaysiz?",
        "ask_role": "Qaysi lavozimda ishlaysiz?",
        "ask_help": "Universitet sizga ish topishda yordam bersinmi?",
        "ask_share": "Ma'lumotlaringizni ish beruvchilarga ulashishni istaysizmi?",
        "channels": "Quyidagi kanallarga a'zo bo'ling:",
        "ask_suggestions": "Universitet faoliyatini takomillashtirish bo'yicha takliflaringiz:",
        "ask_lang_select": "Til bilish darajangizni belgilang:",
        "lang_english": "🇬🇧 Ingliz tili",
        "lang_russian": "🇷🇺 Rus tili",
        "ask_english_level": "Ingliz tili darajangizni kiriting (masalan: B2, Advanced):",
        "ask_russian_level": "Rus tili darajangizni kiriting (masalan: B1, Intermediate):",
        "thanks": "Rahmat! Ma'lumotlaringiz qabul qilindi. ✅\n\nHujjat (CV, IELTS) yuklash uchun /upload bosing.",
        "submission_failed": "Ma'lumotlarni yuborishda xatolik. /retry bilan qayta urinib ko'ring.",
        "use_buttons": "Iltimos, yuqoridagi tugmalardan birini tanlang.",
        "cancelled": "Bekor qilindi. Qaytadan boshlash uchun /start bosing.",
        "unknown_command": "Boshlash uchun /start bosing.",
        "retry_nothing": "Qayta yuboriladigan ma'lumot yo'q. /start bilan boshlang.",
        # Document upload
        "ask_doc_type": "Qanday hujjat yuklaysiz?",
        "doc_type_cv": "📄 CV / Rezyume",
        "doc_type_ielts": "📊 IELTS / Til sertifikati",
        "doc_type_cert": "📜 Boshqa sertifikat",
        "ask_doc_file": "Hujjatni yuboring (PDF yoki rasm):",
        "doc_upload_success": "Hujjat muvaffaqiyatli yuklandi ✅",
        "doc_upload_failed": "Hujjat yuklashda xatolik. Qayta urinib ko'ring.",
        "doc_invalid_file": "Iltimos, faqat PDF yoki rasm fayl yuboring.",
        "upload_not_registered": "Hujjat yuklash uchun avval /start bilan ro'yxatdan o'ting.",
        # Followup
        "followup_answer_received": "Javobingiz qabul qilindi ✅",
        "followup_answer_failed": "Xatolik yuz berdi. Keyinroq urinib ko'ring.",
    },
    "ru": {
        "ask_language": "Tilni tanlang / Выберите язык:",
        "verify_intro": "Для продолжения нам нужно найти вас в системе.",
        "ask_student_id": "Введите ваш Student ID:",
        "ask_birth_date": "Введите дату рождения (ДД.ММ.ГГГГ):",
        "birth_date_invalid": "Неверный формат. Введите в виде ДД.ММ.ГГГГ (например: 15.04.2002):",
        "verify_success": "Подтверждено ✅",
        "verify_failed": "Студент не найден. Неверный ID или дата рождения.\nПопробуйте снова или нажмите /cancel.",
        "verify_error": "Ошибка при проверке. Попробуйте позже.",
        "consent_text": (
            "Для регистрации подтвердите согласие со следующими условиями:\n\n"
            "📋 Ваши личные данные обрабатываются центром трудоустройства\n"
            "📊 Данные могут быть переданы работодателям\n\n"
            "Вы согласны?"
        ),
        "consent_yes": "✅ Согласен",
        "consent_no": "❌ Отказать",
        "consent_declined": "Согласие не дано. Для использования сервиса требуется согласие.\nНажмите /start снова.",
        "register_error": "Ошибка при регистрации. Попробуйте позже.",
        "ask_contact": "Поделитесь своим номером телефона:",
        "contact_button": "📱 Поделиться номером",
        "ask_first": "Введите ваше имя:",
        "ask_last": "Введите вашу фамилию:",
        "ask_gender": "Выберите ваш пол:",
        "gender_male": "👨 Мужской",
        "gender_female": "👩 Женский",
        "ask_region": "Выберите ваш регион:",
        "ask_employment": "Вы сейчас работаете?",
        "yes": "✅ Да",
        "no": "❌ Нет",
        "ask_company": "В какой компании вы работаете?",
        "ask_role": "На какой должности вы работаете?",
        "ask_help": "Хотите, чтобы университет помог найти работу?",
        "ask_share": "Хотите поделиться данными с работодателями?",
        "channels": "Подпишитесь на каналы:",
        "ask_suggestions": "Ваши предложения по улучшению деятельности университета:",
        "ask_lang_select": "Укажите уровень владения языками:",
        "lang_english": "🇬🇧 Английский",
        "lang_russian": "🇷🇺 Русский",
        "ask_english_level": "Введите уровень английского (например: B2, Advanced):",
        "ask_russian_level": "Введите уровень русского (например: B1, Intermediate):",
        "thanks": "Спасибо! Ваши данные приняты. ✅\n\nДля загрузки документов нажмите /upload.",
        "submission_failed": "Ошибка при отправке данных. Нажмите /retry.",
        "use_buttons": "Пожалуйста, выберите один из вариантов.",
        "cancelled": "Отменено. Нажмите /start для повтора.",
        "unknown_command": "Нажмите /start для начала.",
        "retry_nothing": "Нет данных для повторной отправки. Начните с /start.",
        "ask_doc_type": "Какой документ загружаете?",
        "doc_type_cv": "📄 CV / Резюме",
        "doc_type_ielts": "📊 IELTS / Языковой сертификат",
        "doc_type_cert": "📜 Другой сертификат",
        "ask_doc_file": "Отправьте документ (PDF или фото):",
        "doc_upload_success": "Документ успешно загружен ✅",
        "doc_upload_failed": "Ошибка загрузки. Попробуйте ещё раз.",
        "doc_invalid_file": "Пожалуйста, отправьте PDF или фото.",
        "upload_not_registered": "Для загрузки документов сначала пройдите регистрацию через /start.",
        "followup_answer_received": "Ваш ответ принят ✅",
        "followup_answer_failed": "Произошла ошибка. Попробуйте позже.",
    },
}

CHANNELS = [
    {"name": "TTPU Career Center", "url": "https://t.me/+JCloQxJacT5lMjRi"},
]

DOC_TYPE_MAP = {
    "cv": "CV",
    "ielts": "IELTS",
    "cert": "CERT",
}


def get_text(key: str, lang: str = "uz") -> str:
    return PROMPTS.get(lang, PROMPTS["uz"]).get(key, PROMPTS["uz"].get(key, key))
