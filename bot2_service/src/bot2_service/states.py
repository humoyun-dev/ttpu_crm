from aiogram.fsm.state import State, StatesGroup


class BotState(StatesGroup):
    # Verification
    waiting_language = State()
    waiting_student_id = State()
    waiting_birth_date = State()
    waiting_consent = State()

    # Survey
    waiting_contact = State()
    waiting_gender = State()
    waiting_region = State()
    waiting_direction = State()   # asked when roster has no program
    waiting_course_year = State() # asked after direction
    waiting_employment = State()
    waiting_company = State()
    waiting_role = State()
    waiting_help = State()
    waiting_share_consent = State()
    waiting_suggestions = State()

    # CV & language certificate (unemployed only)
    waiting_cv = State()
    waiting_languages = State()
    waiting_certificate = State()

    # Confirmation before submit
    waiting_confirmation = State()

    # Main menu (after successful submission)
    in_menu = State()
