# Cafea Office App

Aplicatie web pentru gestiunea stocului de cafea.

## Structura

- `cafea/index.html` + `cafea/app.js` + `cafea/app.css` - frontend React (fara build)
- `cafea/backend` - API Node.js + SQL (namespace `cafea`)

## Backend Run

```bash
cd cafea/backend
cp .env.example .env
npm install
npm run seed:admin
npm start
```

## API

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/coffee/status`
- `POST /api/coffee/consume`
- `GET /api/coffee/history`
- `POST /api/admin/stock/init` (admin)
- `GET/POST/PUT /api/admin/users` (admin)
- `GET /api/admin/export.csv` (admin)

## Frontend

Frontend foloseste `window.CAFEA_API_BASE` (default `https://cafea-api.axxa.dev`).

## Roluri

- `admin`: gestioneaza stoc, useri, CSV
- `user`: consuma cafea si vede istoricul propriu
