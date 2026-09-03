from typing import Annotated

from pydantic import BeforeValidator, Field
from pydantic_settings import BaseSettings, NoDecode


def _parse_cors_origins(value):
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text or text == "*":
            return ["*"]
        if text.startswith("["):
            import json
            return json.loads(text)
        return [part.strip() for part in text.split(",") if part.strip()]
    return ["*"]


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/stockkeeper"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    CORS_ORIGINS: Annotated[list[str], NoDecode, BeforeValidator(_parse_cors_origins)] = Field(
        default_factory=lambda: ["*"]
    )

    class Config:
        env_file = ".env"


settings = Settings()
