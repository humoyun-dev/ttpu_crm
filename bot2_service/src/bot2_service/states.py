from aiogram.fsm.state import State, StatesGroup


class SurveyState(StatesGroup):
    waiting_language = State()
    waiting_contact = State()
    waiting_first_name = State()
    waiting_last_name = State()
    waiting_gender = State()
    waiting_region = State()
    waiting_student_id = State()
    waiting_program = State()
    waiting_course_year = State()
    waiting_employment = State()
    waiting_company = State()
    waiting_role = State()
    waiting_help = State()
    waiting_share_consent = State()
    waiting_channels = State()
