# Деплой: Cloudflare Pages + Render + Neon

Клиент — статика. Игровой процесс (HTTP API + Colyseus WebSocket) — один Render Web Service на одном публичном порту. Аккаунты, колоды, ELO, XP, коллекция — Neon PostgreSQL через `DATABASE_URL`. Миграции (`migratePlayers`) выполняются при старте сервера.

Репозиторий — npm workspaces. **Root Directory везде: корень репозитория**, не `apps/server` и не `apps/client`. Иначе не соберутся `@kartishki/shared` и `@kartishki/i18n`.

Node **>= 22.12**. Редактор (`apps/editor`) в этот контур не входит.

## Порядок

1. Создать базу Neon и скопировать connection string.
2. Задеплоить Render (backend).
3. Взять публичный URL вида `https://<service>.onrender.com`.
4. Задать `VITE_SERVER_URL` на этот URL.
5. Задеплоить Cloudflare Pages.
6. Взять URL Pages (`https://<project>.pages.dev` или свой домен).
7. Прописать его в Render `CORS_ORIGIN`.
8. Redeploy backend, если CORS задали после первого деплоя.
9. Проверить `/health`, логин, 1v1 и поле сражений.

## Neon

1. [console.neon.tech](https://console.neon.tech) → проект → database.
2. Connection string **с** `?sslmode=require` (pooled или direct — оба ок для этого сервера).
3. Вставить **только в Render** как `DATABASE_URL`. Не в Pages, не в `VITE_*`.
4. Пустая база: при старте сервер создаст таблицы сам. Отдельная команда миграции не нужна.
5. Без `DATABASE_URL` локально остаётся PGlite в `data/players` (gitignored).

## Render — Web Service

| Поле | Значение |
|---|---|
| Service type | Web Service |
| Repository | этот git-репозиторий |
| Root Directory | *(пусто — корень репо)* |
| Runtime | Node |
| Instance | Free допустим (спит после ~15 мин без inbound) |
| Build Command | `npm ci && npm run build -w @kartishki/server` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Node | `NODE_VERSION=22.12.0` (Environment) |

Ожидаемый URL: `https://<имя-сервиса>.onrender.com`

Переменные окружения Render:

| Имя | Пример | Обязательно |
|---|---|---|
| `NODE_VERSION` | `22.12.0` | да |
| `HOST` | `0.0.0.0` | нет (это уже default) |
| `PORT` | задаёт Render сам | не переопределять |
| `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require` | да, иначе аккаунты умрут с диском |
| `CORS_ORIGIN` | `https://<проект>.pages.dev` | да, после появления Pages URL |
| `CATALOG_FILE` | не задавать — берётся `apps/server/data/catalog.json` из репо | нет |
| `PLAYER_DATA_DIR` | не нужен при Neon | нет |

Проверка: `GET https://<service>.onrender.com/health` → `{"status":"ok"}`.

Клиент ходит на тот же origin: `/api/*` и Colyseus `/matchmake` + WebSocket (браузер сам делает `wss://` с `https://` `VITE_SERVER_URL`).

## Cloudflare Pages

| Поле | Значение |
|---|---|
| Repository | тот же git |
| Root Directory | *(пусто — корень репо)* |
| Framework preset | None |
| Build command | `npm ci && npm run build -w @kartishki/client` |
| Build output directory | `apps/client/dist` |
| Node | 22 (Environment `NODE_VERSION=22.12.0`) |

Переменные **только** для сборки клиента:

| Имя | Пример |
|---|---|
| `VITE_SERVER_URL` | `https://<service>.onrender.com` |

Не добавлять: `DATABASE_URL`, пароли, `HOST`, `CORS_ORIGIN`.

После смены `VITE_SERVER_URL` нужна **новая сборка** Pages — значение вшивается в JS. Сборка на Pages без этой переменной падает (`CF_PAGES`).

## Эфемерный диск Render Free

Пишется в Postgres (живёт после рестарта), если задан `DATABASE_URL`:

- аккаунт, пароль, сессии
- ELO, валюта, XP, daily
- коллекция, колоды
- награды матча / поля сражений

В репозитории (свежий Render-деплой стартует с этим набором):

- `apps/server/data/catalog.json` — текущий каталог карт/героев/поля/музыки меню
- `apps/server/data/music/*.ogg` — треки меню
- `apps/server/data/portraits/*.png` — оригиналы портретов (игровой арт уже внутри JSON как data URL)

Только на диске процесса (пропадёт после сна/деплоя):

- новые публикации редактора поверх этого каталога
- новые загрузки в `portraits` / `music`
- PGlite `apps/server/data/players`, если **нет** `DATABASE_URL`

Лестница пива и демо-магазин на клиенте — `localStorage` браузера, не сервер.

## Локальная разработка

Без переменных: как раньше.

```powershell
npm ci
npm run dev
```

- клиент: http://127.0.0.1:5173
- редактор: http://127.0.0.1:5174
- сервер: http://127.0.0.1:2567 (слушает `0.0.0.0`, loopback работает)
- CORS: локальные Vite-порты всегда разрешены
- база: PGlite, пока нет `DATABASE_URL`

`HOST=127.0.0.1` при необходимости оставляет только loopback.

## Риски Free-тарифа

- Render Free засыпает ~15 минут без входящего трафика: холодный старт ~1 мин, комната Colyseus пустая.
- Первый запрос к спящему Neon (~0.6 с) чуть медленнее.
- Редактор с продакшен-сервером затрёт каталог на эфемерном диске — не публикуйте его в интернет.
