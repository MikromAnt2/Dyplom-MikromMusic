# Mikrom — music web app

Mikrom is a дипломний проєкт: музичний веб‑застосунок для пошуку та прослуховування треків, перегляду виконавців/альбомів/плейлистів, з чергою та рекомендаціями.

## Tech stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **DB**: PostgreSQL (Sequelize) + MongoDB (Mongoose)
- **Auth**: sessions + Google OAuth
- **Music**: YouTube Data API + `youtubei.js` (Innertube)
- **UI languages**: UK/EN via `frontend/src/translations/`

## Project structure

- `frontend/` — клієнт (React/Vite)
- `backend/` — сервер (Express API)
- `.env` — секрети/налаштування

## Requirements

- Node.js 18+ (рекомендовано LTS)
- MongoDB (локально або Atlas)
- PostgreSQL (локально або хостинг)
- YouTube Data API key (для пошуку)

## Environment variables

Необхіднр ситворити файл `.env` у корені проєкту.

Мінімально потрібні:

```env
# backend
PORT=3000
SESSION_SECRET=change-me

# databases
MONGO_URI=mongodb://127.0.0.1:27017/mikrom
DATABASE_URL=postgres://user:password@localhost:5432/mikrom

# youtube
YT_API_KEY=YOUR_KEY
```

> Backend підхоплює `.env` як `require('dotenv').config({ path: '../.env' });` у `backend/app.js`.

## Install

У корені проєкту:

```bash
npm install
```

Потім у фронтенді:

```bash
cd frontend
npm install
```

## Run (dev)

### Backend

```bash
cd backend
node app.js
```

API буде на `http://localhost:3000`.

### Frontend

```bash
cd frontend
npm run dev -- --host
```

Vite покаже адресу.

## Tests

З кореня проєкту:

```bash
npm test
```

