"""Runtime configuration, read from environment variables (and backend/.env in development)."""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = Field(default="development", alias="SAHELI_ENV")

    # Public origin of the site, used in emails and status links. No trailing slash.
    public_url: str = Field(default="http://localhost:5173", alias="SAHELI_PUBLIC_URL")

    database_url: str = Field(alias="DATABASE_URL")

    # Supabase
    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_anon_key: str = Field(alias="SUPABASE_ANON_KEY")  # publishable, safe for the browser
    supabase_service_key: str = Field(default="", alias="SUPABASE_SERVICE_KEY")  # server only
    # Only for projects still on the legacy shared JWT secret (and for local development).
    supabase_jwt_secret: str = Field(default="", alias="SUPABASE_JWT_SECRET")
    storage_bucket: str = Field(default="evidence", alias="SAHELI_STORAGE_BUCKET")

    # Storage backend: "supabase" in production, "local" for development and tests.
    storage_backend: str = Field(default="supabase", alias="SAHELI_STORAGE_BACKEND")
    local_storage_dir: str = Field(default=".storage", alias="SAHELI_LOCAL_STORAGE_DIR")

    # 32-byte key, base64 encoded. Encrypts evidence and other sensitive text before storage.
    encryption_key: str = Field(alias="SAHELI_ENCRYPTION_KEY")
    # Secret used to hash tokens, codes and IP addresses. Any long random string.
    hash_secret: str = Field(alias="SAHELI_HASH_SECRET")

    # AI
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    llm_provider: str = Field(default="auto", alias="SAHELI_LLM_PROVIDER")
    llm_model: str = Field(default="", alias="SAHELI_LLM_MODEL")
    llm_timeout_seconds: float = Field(default=60.0, alias="SAHELI_LLM_TIMEOUT")

    # Optional integrations
    safe_browsing_api_key: str = Field(default="", alias="GOOGLE_SAFE_BROWSING_API_KEY")
    resend_api_key: str = Field(default="", alias="RESEND_API_KEY")
    email_from: str = Field(default="", alias="SAHELI_EMAIL_FROM")

    # Who runs this deployment. Shown in the Privacy Policy, Terms and Contact pages.
    operator_name: str = Field(default="", alias="SAHELI_OPERATOR_NAME")
    support_email: str = Field(default="", alias="SAHELI_SUPPORT_EMAIL")
    governing_law: str = Field(default="", alias="SAHELI_GOVERNING_LAW")

    # Serve the built frontend from this folder if it exists.
    frontend_dist: str = Field(default="../frontend/dist", alias="SAHELI_FRONTEND_DIST")

    run_background_jobs: bool = Field(default=True, alias="SAHELI_RUN_JOBS")

    @field_validator("public_url", "supabase_url")
    @classmethod
    def strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def ai_enabled(self) -> bool:
        if self.llm_provider == "anthropic":
            return bool(self.anthropic_api_key)
        if self.llm_provider == "gemini":
            return bool(self.gemini_api_key)
        return bool(self.anthropic_api_key or self.gemini_api_key)

    @property
    def email_enabled(self) -> bool:
        return bool(self.resend_api_key and self.email_from)

    @property
    def safe_browsing_enabled(self) -> bool:
        return bool(self.safe_browsing_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
