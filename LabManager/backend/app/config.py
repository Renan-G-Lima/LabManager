import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DATABASE_URL: str    = os.getenv("DATABASE_URL", "")
    SUPABASE_URL: str    = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str    = os.getenv("SUPABASE_KEY", "")
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "*")

    # Pool config
    DB_MIN_SIZE: int     = 2
    DB_MAX_SIZE: int     = 10
    DB_TIMEOUT: int      = 30

    def validate(self) -> None:
        if not self.DATABASE_URL:
            raise ValueError("DATABASE_URL not set in .env")


settings = Settings()
settings.validate()