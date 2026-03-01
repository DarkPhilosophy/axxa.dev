# Cafea Office

Aplicatie web pentru gestiunea stocului de cafea.

## Structura

- `cafea/index.html` + `cafea/app.js` + `cafea/app.css`: frontend
- `cafea/backend`: API Node.js (Express)

## API Base

Frontend foloseste `window.CAFEA_API_BASE` cu endpoint-ul public:

- `https://cafea.axxa.dev/api`

## Endpoint-uri importante

- `GET /health`
- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/coffee/status`
- `POST /api/coffee/consume`
- `GET /api/coffee/history`
- `POST /api/admin/stock/init` (admin)
- `GET/POST/PUT /api/admin/users` (admin)
- `GET /api/admin/export.csv`

## Backend Local (fara Docker)

```bash
cd cafea/backend
cp .env.example .env
npm install
npm run seed:admin
npm start
```

## Backend Docker (local)

```bash
cd cafea/backend
cp .env.example .env
docker compose -f docker-compose.backend.yml up -d --build
```

Verificare:

```bash
curl http://127.0.0.1:8788/api/health
```

Stop:

```bash
docker compose -f docker-compose.backend.yml down
```

## Deploy Oracle (Traefik + Netbird)

Fisierul `docker-compose.backend.oracle.yml` este override pentru productie.

```bash
cd /home/alexa/cafea-backend
cp .env.example .env   # doar prima data

docker compose \
  -f docker-compose.backend.yml \
  -f docker-compose.backend.oracle.yml \
  up -d --build
```

Verificari:

```bash
curl -sS http://127.0.0.1:8788/api/health
curl -sS https://cafea.axxa.dev/api/health
```

## Note

- Pentru productie, tunnel/origin-ul Cloudflare trebuie sa pointeze la Oracle pe origin-ul corect (compatibil cu `:8788` si/sau Traefik).
- Daca vezi `502`, verifica in ordinea asta: container health -> `:8788` local -> Traefik route -> Cloudflare tunnel.

## Roluri

- `admin`: gestioneaza stoc, useri, CSV
- `user`: consuma cafea si vede istoricul propriu
