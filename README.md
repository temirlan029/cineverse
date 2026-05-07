# CineVerse

> Твой мир кино в одном месте — поиск фильмов, мини-игры, музыка, новости, погода и аниме.

**Живая версия:** https://cineverse-production-015d.up.railway.app/

---

## О проекте

CineVerse — мультисервисный веб-портал с несколькими разделами в едином стиле:

- **Кинопоиск** — поиск фильмов, рейтинги, описания, постеры через Kinopoisk API
- **Мини-игры** — браузерные игры (тетрис, 2048, змейка и др.) без скачивания
- **Музыка / Новости / Погода / Аниме** — тематические страницы с контентом
- **Профиль** — регистрация, вход, избранное, комментарии, история просмотров

Учебный командный проект.

## Стек

**Frontend**
- HTML5, CSS3, ванильный JavaScript
- Мультистраничная архитектура (`public/*.html`)
- PWA-основа (`manifest.json`, `sw.js`)

**Backend**
- Node.js 18+, Express
- MongoDB Atlas + Mongoose (избранное, комментарии, история)
- `cookie-session` для хранения сессии в cookie (переживает рестарт сервера)

**Auth**
- Google OAuth 2.0 (`passport-google-oauth20`)
- VK ID OAuth (ручная PKCE-реализация без библиотеки)

**API**
- Kinopoisk API проксируется через `/api/kp/*` — ключ скрыт на бэкенде и не утекает в клиент

**Hosting**
- Railway (авто-деплой при пуше в `master`)

## Локальный запуск

```bash
git clone https://github.com/temirlan029/cineverse.git
cd cineverse
npm install
cp .env.example .env   # заполнить переменные окружения
npm run dev            # или npm start
```

Сервер поднимается на порту из `PORT` (по умолчанию `3000`).

## Переменные окружения

См. `.env.example`. Основные:

| Переменная | Назначение |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `VK_APP_ID` | VK ID приложение |
| `KINOPOISK_API_KEY` | ключ Kinopoisk API (не коммитится) |
| `MONGODB_URI` | строка подключения к MongoDB Atlas |
| `SESSION_SECRET` | подпись cookie-session |
| `SITE_URL` | полный адрес сайта c `https://` (для OAuth callback) |

## Структура

```
cineverse/
├── server.js              # Express сервер + API роуты + OAuth
├── public/
│   ├── index.html         # главная
│   ├── kinopoisk.html     # поиск фильмов
│   ├── minigames.html     # игры
│   ├── music.html
│   ├── news.html
│   ├── weather.html
│   ├── anime.html
│   ├── profile.html       # личный кабинет
│   ├── about.html
│   ├── auth.js            # клиентская логика авторизации
│   ├── global.js          # общие скрипты
│   ├── style.css
│   ├── sw.js              # service worker (PWA)
│   └── manifest.json
├── package.json
└── .env.example
```

## Авторы

Командный учебный проект:
- **Бейсенов Нурбол**
- **Карлыбай Темирлан** — [@temirlan029](https://github.com/temirlan029)
- **Кулмурын Идирис**
