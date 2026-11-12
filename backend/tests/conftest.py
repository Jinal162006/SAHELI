import base64
import os
import tempfile

# Test settings are fixed here so tests never touch the development database or real services.
os.environ.update(
    {
        "SAHELI_ENV": "test",
        "DATABASE_URL": os.environ.get("TEST_DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54329/saheli_test"),
        "SUPABASE_URL": "http://auth.test",
        "SUPABASE_ANON_KEY": "test-anon",
        "SUPABASE_SERVICE_KEY": "",
        "SUPABASE_JWT_SECRET": "test-secret-for-hs256-tokens-only-used-in-tests",
        "SAHELI_STORAGE_BACKEND": "local",
        "SAHELI_LOCAL_STORAGE_DIR": tempfile.mkdtemp(prefix="saheli-test-storage-"),
        "SAHELI_ENCRYPTION_KEY": base64.b64encode(b"k" * 32).decode(),
        "SAHELI_HASH_SECRET": "test-hash-secret",
        "ANTHROPIC_API_KEY": "",
        "GOOGLE_SAFE_BROWSING_API_KEY": "",
        "RESEND_API_KEY": "",
        "SAHELI_EMAIL_FROM": "",
        "SAHELI_RUN_JOBS": "false",
        "SAHELI_FRONTEND_DIST": "does-not-exist",
    }
)
