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
        "ask_direction": "Ta'lim yo'nalishingizni tanlang:",
        "ask_course_year": "Qaysi kursda o'qiysiz?",
        "ask_employment": "Hozirda ishlaysizmi?",
        "yes": "✅ Ha",
        "no": "❌ Yo'q",
        "ask_company": "Qaysi kompaniyada ishlaysiz?",
        "ask_role": "Qaysi lavozimda ishlaysiz?",
        "ask_help": "Universitet sizga ish topishda yordam bersinmi?",
        "ask_share": "Ma'lumotlaringizni ish beruvchilarga ulashishni istaysizmi?",
        "channels": "Quyidagi kanallarga a'zo bo'ling:",
        "ask_suggestions": "Universitet faoliyatini takomillashtirish bo'yicha takliflaringiz:",
        "suggestions_skip": "📭 Taklifim yo'q",
        "ask_lang_select": "Til bilish darajangizni belgilang:",
        "lang_english": "🇬🇧 Ingliz tili",
        "lang_russian": "🇷🇺 Rus tili",
        "ask_english_level": "Ingliz tili darajangizni kiriting (masalan: B2, Advanced):",
        "ask_russian_level": "Rus tili darajangizni kiriting (masalan: B1, Intermediate):",
        "thanks": "Rahmat! Ma'lumotlaringiz qabul qilindi. ✅",
        "submission_failed": "Ma'lumotlarni yuborishda xatolik. /retry bilan qayta urinib ko'ring.",
        "use_buttons": "Iltimos, yuqoridagi tugmalardan birini tanlang.",
        "cancelled": "Bekor qilindi. Qaytadan boshlash uchun /start bosing.",
        "logged_out": "Hisobingizdan chiqdingiz. Qaytadan kirish uchun /start bosing.",
        "restarted": "Javoblar bekor qilindi. Qaytadan boshlash uchun /start bosing.",
        "welcome_back": "Salom, {name}! 👋",
        "welcome_back_anon": "Xush kelibsiz! 👋",
        "unknown_command": "Boshlash uchun /start bosing.",
        "retry_nothing": "Qayta yuboriladigan ma'lumot yo'q. /start bilan boshlang.",
        # CV upload
        "ask_cv": "CV yoki rezyumengizni yuboring (PDF yoki rasm):",
        "cv_no": "📭 Menda CV yo'q",
        "cv_received": "CV qabul qilindi ✅",
        # Language selection
        "ask_languages": "Qaysi tillarni bilasiz? (bir yoki bir nechta tanlang)",
        "lang_other": "🌐 Boshqa til",
        "lang_done": "✅ Tayyor",
        "select_at_least_one": "Kamida bitta tilni tanlang.",
        # Certificate upload
        "ask_certificate": "Til bilimingizni tasdiqlovchi xalqaro sertifikat yuklang (PDF yoki rasm):",
        "cert_skip": "📭 Sertifikat yo'q",
        "cert_received": "Sertifikat qabul qilindi ✅",
        # Confirmation
        "confirm_send": "Barcha javoblaringizni jo'natayinmi?",
        "confirm_yes": "✅ Ha, jo'nating",
        "confirm_no": "🔄 Yo'q, qaytadan",
        # Review (answers summary before sending)
        "review_title": "📝 <b>Javoblaringiz:</b>",
        "review_direction": "🎓 Yo'nalish:",
        "review_course": "📚 Kurs:",
        "review_employment": "💼 Ish bilan bandlik:",
        "review_company": "🏢 Kompaniya:",
        "review_role": "👔 Lavozim:",
        "review_langs": "🗣 Til darajalari:",
        "review_suggestions": "💬 Takliflar:",
        "review_help": "🤝 Yordam kerak:",
        "review_share": "🔗 Ma'lumot ulashish:",
        "employed_label": "Ishlayman",
        "unemployed_label": "Ishlamayman",
        "course_graduated_label": "Bitirgan",
        "yes_short": "Ha",
        "no_short": "Yo'q",
        "restart_notice": "Yaxshi, qaytadan boshlaymiz. 🔄",
        # Main menu
        "menu_main": "Asosiy bo'limni tanlang:",
        "menu_portfolio": "📄 Portfolio",
        "menu_vacancy": "💼 Vakansiya",
        "menu_survey": "📝 So'rovnoma",
        "menu_account": "👤 Akkaunt",
        "menu_support": "🆘 Support",
        "survey_has_previous": "📊 So'rovnomalar tarixi\n\nOxirgi topshirilgan: <b>{date}</b>\n\nNima qilmoqchisiz?",
        "survey_new": "📝 Yangi so'rovnoma to'ldirish",
        "survey_back_btn": "◀ Orqaga",
        "portfolio_info": (
            "📄 <b>Portfolio</b>\n\n"
            "Siz yuklagan hujjatlar (CV va sertifikatlar) serverda saqlangan.\n"
            "Bandlik Markazi administratori ularni ko'rib chiqadi."
        ),
        "vacancy_info": "💼 <b>Vakansiya</b>\n\nYangi vakansiyalardan xabardor bo'lish uchun kanalimizga a'zo bo'ling:",
        "support_info": (
            "🆘 <b>Yordam</b>\n\n"
            "📞 TTPU Bandlik Markazi\n"
            "📍 Bosh bino, 1-qavat, 118-xona\n\n"
            "Savol yoki muammo bo'lsa kanalimizga yozing."
        ),
        "account_title": "👤 <b>Sizning profilingiz:</b>",
        "account_not_found": "Profil topilmadi. /start bilan qayta kiring.",
        "account_name": "📋 Ism:",
        "account_phone": "📱 Telefon:",
        "account_gender": "👤 Jins:",
        "account_region": "🗺 Hudud:",
        "account_survey": "📊 So'rovnoma topshirildi:",
        "gender_male_label": "Erkak",
        "gender_female_label": "Ayol",
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
        "ask_direction": "Выберите направление обучения:",
        "ask_course_year": "На каком курсе вы учитесь?",
        "ask_employment": "Вы сейчас работаете?",
        "yes": "✅ Да",
        "no": "❌ Нет",
        "ask_company": "В какой компании вы работаете?",
        "ask_role": "На какой должности вы работаете?",
        "ask_help": "Хотите, чтобы университет помог найти работу?",
        "ask_share": "Хотите поделиться данными с работодателями?",
        "channels": "Подпишитесь на каналы:",
        "ask_suggestions": "Ваши предложения по улучшению деятельности университета:",
        "suggestions_skip": "📭 Нет предложений",
        "ask_lang_select": "Укажите уровень владения языками:",
        "lang_english": "🇬🇧 Английский",
        "lang_russian": "🇷🇺 Русский",
        "ask_english_level": "Введите уровень английского (например: B2, Advanced):",
        "ask_russian_level": "Введите уровень русского (например: B1, Intermediate):",
        "thanks": "Спасибо! Ваши данные приняты. ✅",
        "submission_failed": "Ошибка при отправке данных. Нажмите /retry.",
        "use_buttons": "Пожалуйста, выберите один из вариантов.",
        "cancelled": "Отменено. Нажмите /start для повтора.",
        "logged_out": "Вы вышли из аккаунта. Нажмите /start, чтобы войти снова.",
        "restarted": "Ответы отменены. Нажмите /start чтобы начать заново.",
        "welcome_back": "Привет, {name}! 👋",
        "welcome_back_anon": "Добро пожаловать! 👋",
        "unknown_command": "Нажмите /start для начала.",
        "retry_nothing": "Нет данных для повторной отправки. Начните с /start.",
        # CV upload
        "ask_cv": "Отправьте ваше CV или резюме (PDF или фото):",
        "cv_no": "📭 У меня нет CV",
        "cv_received": "CV принят ✅",
        # Language selection
        "ask_languages": "Какими языками владеете? (выберите один или несколько)",
        "lang_other": "🌐 Другой язык",
        "lang_done": "✅ Готово",
        "select_at_least_one": "Выберите хотя бы один язык.",
        # Certificate upload
        "ask_certificate": "Загрузите международный сертификат, подтверждающий знание языков (PDF или фото):",
        "cert_skip": "📭 Нет сертификата",
        "cert_received": "Сертификат принят ✅",
        "confirm_send": "Отправить все ваши ответы?",
        "confirm_yes": "✅ Да, отправить",
        "confirm_no": "🔄 Нет, начать заново",
        # Review (answers summary before sending)
        "review_title": "📝 <b>Ваши ответы:</b>",
        "review_direction": "🎓 Направление:",
        "review_course": "📚 Курс:",
        "review_employment": "💼 Занятость:",
        "review_company": "🏢 Компания:",
        "review_role": "👔 Должность:",
        "review_langs": "🗣 Языки:",
        "review_suggestions": "💬 Предложения:",
        "review_help": "🤝 Нужна помощь:",
        "review_share": "🔗 Делиться данными:",
        "employed_label": "Работаю",
        "unemployed_label": "Не работаю",
        "course_graduated_label": "Выпускник",
        "yes_short": "Да",
        "no_short": "Нет",
        "restart_notice": "Хорошо, начнём заново. 🔄",
        "followup_answer_received": "Ваш ответ принят ✅",
        "followup_answer_failed": "Произошла ошибка. Попробуйте позже.",
        # Main menu
        "menu_main": "Выберите раздел:",
        "menu_portfolio": "📄 Портфолио",
        "menu_vacancy": "💼 Вакансии",
        "menu_survey": "📝 Анкета",
        "menu_account": "👤 Аккаунт",
        "menu_support": "🆘 Поддержка",
        "survey_has_previous": "📊 История анкет\n\nПоследняя отправлена: <b>{date}</b>\n\nЧто хотите сделать?",
        "survey_new": "📝 Заполнить новую анкету",
        "survey_back_btn": "◀ Назад",
        "portfolio_info": (
            "📄 <b>Портфолио</b>\n\n"
            "Ваши документы (CV и сертификаты) сохранены на сервере.\n"
            "Администратор Центра трудоустройства рассмотрит их."
        ),
        "vacancy_info": "💼 <b>Вакансии</b>\n\nПодпишитесь на наш канал, чтобы не пропустить новые вакансии:",
        "support_info": (
            "🆘 <b>Поддержка</b>\n\n"
            "📞 Центр трудоустройства TTPU\n"
            "📍 Главный корпус, 1 этаж, каб. 118\n\n"
            "По вопросам пишите в наш канал."
        ),
        "account_title": "👤 <b>Ваш профиль:</b>",
        "account_not_found": "Профиль не найден. Войдите через /start.",
        "account_name": "📋 Имя:",
        "account_phone": "📱 Телефон:",
        "account_gender": "👤 Пол:",
        "account_region": "🗺 Регион:",
        "account_survey": "📊 Анкета отправлена:",
        "gender_male_label": "Мужской",
        "gender_female_label": "Женский",
    },
}

CHANNELS = [
    {"name": "TTPU Career Center", "url": "https://t.me/+JCloQxJacT5lMjRi"},
]


def get_text(key: str, lang: str = "uz") -> str:
    return PROMPTS.get(lang, PROMPTS["uz"]).get(key, PROMPTS["uz"].get(key, key))


def channels_text(lang: str = "uz") -> str:
    """Return channel list as HTML text links (no inline keyboard needed)."""
    header = get_text("channels", lang)
    links = "\n".join(f'• <a href="{ch["url"]}">{ch["name"]}</a>' for ch in CHANNELS)
    return f"{header}\n{links}"
