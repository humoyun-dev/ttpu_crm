from aiogram.fsm.state import State, StatesGroup


class ProfileState(StatesGroup):
    waiting_for_language = State()
    waiting_for_contact = State()
    waiting_for_first_name = State()
    waiting_for_last_name = State()
    waiting_for_gender = State()
    waiting_for_birth_date = State()
    waiting_for_email = State()
    waiting_for_region = State()
    waiting_for_extra_phone = State()


class CampusState(StatesGroup):
    org = State()
    title = State()
    second_phone = State()
    visitor_count = State()
    date = State()
    time = State()
    time_custom = State()
    gender = State()
    region = State()
    confirm = State()


class FoundationState(StatesGroup):
    second_phone = State()
    extras = State()
    gender = State()
    region = State()
    confirm = State()


class PolitoState(StatesGroup):
    subject = State()
    gender = State()
    region = State()
    confirm = State()


class AdmissionsState(StatesGroup):
    track = State()
    direction = State()
    region = State()
    second_phone = State()
    confirm = State()
