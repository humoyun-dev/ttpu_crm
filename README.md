# ttpu_crm


## Production checklist
- Backend: set strong `DJANGO_SECRET_KEY`, disable debug (`DJANGO_DEBUG=false`), configure `DJANGO_ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS`.
- Backend security: enable HTTPS settings from `server/.env.example` (`SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, HSTS).
- Dashboard: set `NEXT_PUBLIC_API_URL` to production API domain and run `npm run build && npm run start`.
- Bot services: use production `SERVER_BASE_URL` and raw service tokens; store secrets only in environment (no hardcoded tokens).
- Database: use managed Postgres backups and monitor migration rollout before deploying bot and dashboard changes.
