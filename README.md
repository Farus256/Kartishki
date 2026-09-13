# Картишки

Рабочий первый срез CCG: отдельный редактор карт и бой двух игроков.
TypeScript / React / PixiJS 8 / Colyseus 0.18, npm workspaces, русский язык
по умолчанию и английский перевод через i18next. Node >=22.12, npm >=10.

## Запуск

```powershell
Set-Location D:\KARTISHKI
npm ci
npm run dev
```

- Игра: http://127.0.0.1:5173 — гости: две вкладки и «Найти соперника». Аккаунт сохраняет колоду, рейтинг и добычу.
- Редактор: http://127.0.0.1:5174.
- Colyseus и API: http://127.0.0.1:2567 (процесс слушает `0.0.0.0`).

Прод: Cloudflare Pages + Render + Neon — [DEPLOYMENT.md](DEPLOYMENT.md).

