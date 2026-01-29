import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.memory import MemoryStorage

from bot1_service.api import CrmApiClient
from bot1_service.catalog_cache import CatalogCache
from bot1_service.config import settings
from bot1_service.handlers import router, setup_dependencies
from bot1_service.store import Store


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


async def main():
    bot = Bot(
        token=settings.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=MemoryStorage())
    api = CrmApiClient()
    catalog = CatalogCache(api=api, ttl_seconds=settings.catalog_cache_ttl)
    storage = Store()
    setup_dependencies(api, catalog, storage)
    dp.include_router(router)

    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await api.close()


if __name__ == "__main__":
    asyncio.run(main())
