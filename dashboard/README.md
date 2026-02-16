# TTPU CRM Dashboard (Next.js)

## Development
```bash
npm ci
npm run dev
```

## Production build
```bash
npm ci
npm run build
npm run start
```

## Required environment variables
Create `.env` in `dashboard/`:

```env
NEXT_PUBLIC_API_URL=https://api.example.com
```

> `NEXT_PUBLIC_API_URL` must point to the backend `/api/v1` host (without trailing slash logic issues, e.g. `https://api.example.com`).

## Production notes
- Route guard uses `proxy.ts` and checks `access_token` or `dashboard_auth` cookie for redirect behavior.
- Keep backend cookie security enabled in production:
  - `JWT_COOKIE_SECURE=true`
  - `JWT_COOKIE_SAMESITE=Lax` (or `None` for cross-site setups with HTTPS)
- Run behind reverse proxy (Nginx/Traefik) and terminate TLS at proxy.
