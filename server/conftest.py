"""Root pytest conftest.

Runs before pytest-django calls ``django.setup()``, so it is the right place to
pin test-only environment defaults:

* ``DJANGO_SECRET_KEY`` — production settings now fail fast on the dev default
  when ``DJANGO_DEBUG`` is false (which it is under tests), so give tests a key.
* transport-security flags off — the test client speaks plain HTTP, so SSL
  redirect / Secure cookies must not be force-enabled by the prod-safe defaults.

Each uses ``setdefault`` so a real CI environment can still override them.
"""

import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-insecure-secret-key-not-for-production")
os.environ.setdefault("SECURE_SSL_REDIRECT", "false")
os.environ.setdefault("JWT_COOKIE_SECURE", "false")
os.environ.setdefault("SESSION_COOKIE_SECURE", "false")
os.environ.setdefault("CSRF_COOKIE_SECURE", "false")
os.environ.setdefault("SECURE_HSTS_SECONDS", "0")
