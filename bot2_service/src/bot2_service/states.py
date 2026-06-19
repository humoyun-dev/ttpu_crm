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
    waiting_employment = State()
    waiting_company = State()
    waiting_role = State()
    waiting_help = State()
    waiting_share_consent = State()
    waiting_suggestions = State()

    # Document upload
    waiting_document_type = State()
    waiting_document_file = State()
