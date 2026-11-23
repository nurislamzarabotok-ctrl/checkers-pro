# Шашки Pro — Онлайн-арена (GitHub + Сервер)

Полноценное кроссплатформенное веб-приложение «Шашки Pro» (iPhone, Android, ПК) с реальным онлайн-сервером, защищёнными аккаунтами, 7 мировыми правилами, уровнями 1–10 000+ (и далее бесконечно), 20 званиями с 3 полосками, плавающими эмодзи-реакциями, живым чатом и игровой ареной без скроллов.

## Как выложить на GitHub и запустить бесплатный онлайн-сервер

### Шаг 1. Загрузите проект на GitHub
1. Создайте новый репозиторий на [github.com](https://github.com/new), например `checkers-pro`.
2. Распакуйте этот архив и загрузите все файлы (`public/`, `server/`, `package.json`, `.gitignore`, `README.md`) в репозиторий через сайт GitHub или команды:
   ```bash
   git init
   git add .
   git commit -m "Initial release: Checkers Pro Online"
   git branch -M main
   git remote add origin https://github.com/<ВАШ_ЛОГИН>/checkers-pro.git
   git push -u origin main
   ```

### Шаг 2. Запустите сервер бесплатно (Render.com / Railway)
1. Зайдите на [render.com](https://render.com) → **New +** → **Web Service** → выберите ваш репозиторий `checkers-pro`.
2. Укажите настройки:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variables:** добавьте переменную `SESSION_SECRET` (любая длинная случайная строка из 32+ символов).
3. Нажмите **Deploy Web Service** — через 1–2 минуты вы получите готовую HTTPS-ссылку, по которой можно играть онлайн с любого iPhone, Android и ПК!

### Локальный запуск на ПК
```bash
npm install
npm start
```
Откройте в браузере `http://localhost:3000`.

## Безопасность аккаунтов и сервера
- Пароли никогда не хранятся в открытом виде — используется **scrypt** с индивидуальной случайной солью (`crypto.scryptSync`) и проверкой `crypto.timingSafeEqual`.
- Сессионные токены подписываются **HMAC-SHA256** со сроком действия.
- Защита от перебора паролей и спама в чате (Rate Limiter), фильтрация XSS, защитные HTTP-заголовки (`helmet`).
- Расчёт ELO и XP в онлайн-партиях выполняется на стороне сервера.
