# CineVerse — Project Info

## Project Overview
Multi-page web app: movie search, anime, mini-games, music, news, weather.
School project by: Бейсенов Нурбол, Карлыбай Темирлан, Кулмурын Идирис.

## Tech Stack
- **Backend**: Node.js + Express (`server.js`)
- **Auth**: Google OAuth (passport-google-oauth20) + VK ID OAuth (manual PKCE, no library)
- **Database**: MongoDB Atlas (mongoose) — favorites, comments, history
- **Session**: cookie-session (stored in browser cookie, survives server restarts)
- **Frontend**: Static HTML/CSS/JS in `public/` folder
- **API Proxy**: Kinopoisk API proxied through `/api/kp/*` (key hidden from client)
- **Hosting**: Railway (auto-deploy from GitHub on push to master)

## URLs
- **Live site**: https://cineverse-production-015d.up.railway.app/
- **GitHub**: https://github.com/temirlan029/cineverse.git
- **Branch**: master

## Railway Environment Variables
- `GOOGLE_CLIENT_ID` — Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` — Google OAuth secret
- `VK_APP_ID` — VK ID app ID (54578331, registered at id.vk.com/business)
- `KINOPOISK_API_KEY` — Kinopoisk unofficial API key
- `MONGODB_URI` — MongoDB Atlas connection string (mongodb+srv://...)
- `SESSION_SECRET` — cookie-session signing key
- `SITE_URL` — full site URL with https (needed for OAuth callbacks)

**IMPORTANT**: When adding Railway variables, do NOT add leading spaces in variable names — this breaks the build.

## Project Structure
```
/
  server.js          — Express server, OAuth, API routes, MongoDB models
  package.json       — dependencies
  .env               — local env vars (not committed)
  .env.example       — env var template
  .gitignore
  AGENTS.md
  public/
    index.html       — home page
    kinopoisk.html   — movie search with favorites, comments, history
    profile.html     — user profile (stats, favorites, comments, history tabs)
    anime.html       — anime section
    minigames.html   — mini-games
    music.html       — music player
    news.html        — news feed
    weather.html     — weather widget
    about.html       — about project
    auth.js          — OAuth login/logout UI logic
    global.js        — theme toggle, scroll-to-top, burger menu
    style.css        — global styles
    sw.js            — service worker
    manifest.json    — PWA manifest
```

## API Endpoints
- `GET /api/me` — current user info
- `GET /api/providers` — which OAuth providers are enabled
- `GET /auth/google` — start Google OAuth
- `GET /auth/vk` — start VK ID OAuth (PKCE)
- `GET /auth/logout` — logout
- `GET /api/kp/*` — Kinopoisk API proxy
- `GET /api/favorites` — user's favorites list
- `POST /api/favorites` — toggle favorite (add/remove)
- `GET /api/favorites/check/:filmId` — check if film is favorited
- `GET /api/comments/:filmId` — comments for a film
- `POST /api/comments` — add comment
- `DELETE /api/comments/:id` — delete own comment
- `GET /api/history` — user's view history
- `POST /api/history` — track film view
- `GET /api/profile/stats` — favorites/comments/history counts

## Commands
- `npm start` — run server (production)
- `npm run dev` — run with --watch (development)
- `git push origin master` — deploy to Railway

## Key Notes
- VK OAuth uses VK ID (id.vk.com) with PKCE flow, NOT the old oauth.vk.com
- VK ID does not require client_secret when using PKCE
- `device_id` for VK ID must be UUID format and passed in both authorize URL and token exchange
- VK returns `device_id` in callback query params — use that one for token exchange
- MongoDB driver on Node 18 needs `globalThis.crypto` polyfill
- Favorites moved from localStorage to MongoDB (server-side, syncs across devices)
- Navigation includes "Профиль" link on all pages
