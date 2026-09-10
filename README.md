# AK Project · Tap Game

Мобильная тап-игра с авторизацией через New LXP, квестами, рейтингом и серверным античитом.
Стек: Next.js 16 (App Router), React 19, Tailwind v4, Neon Postgres + Drizzle ORM.

## Возможности

- Вход по email и паролю New LXP через GraphQL API; в браузер попадает только httpOnly-cookie серверной сессии, access token New LXP не сохраняется.
- Профиль игрока (имя, аватар, email) подтягивается из New LXP и синхронизируется в базе.
- Кнопка TAP: тапы буферизуются на клиенте и отправляются пачками с идемпотентным `batchId`; сервер сам считает, сколько принять.
- Одна игровая сессия на пользователя: вторая вкладка или устройство блокируется, доступен перехват сессии, heartbeat отслеживает потерю.
- Античит: лимиты в секунду/минуту/день, оценка правдоподобности пачек, накопительный балл подозрения с затуханием, уровни доверия `normal → warning → cooldown → verification → restricted → blocked`, пауза и проверка «вы человек».
- 45 квестов в шести категориях (тапы, за день, серия, рейтинг, общие, особые) с фильтрами, прогрессом, начислением бонусных очков и получением награды.
- Рейтинг по общему числу тапов с подиумом и позицией текущего игрока, обновляется автоматически.
- Профиль со статистикой: всего/сегодня, место, лучший день, серия дней, квесты, проверки.

## Структура

```
app/
  page.tsx, quests/, leaderboard/, profile/, login/   — экраны (RSC + клиентские компоненты)
  api/auth/{login,logout,me}                         — авторизация через New LXP
  api/game/session/{start,heartbeat,end}             — игровая сессия
  api/game/{tap,state,verify,leaderboard}            — игра
  api/game/quests/claim                              — получение награды за квест
components/
  game/        TAP-экран, кнопка, хук use-game (буфер тапов, сессия, heartbeat), диалог проверки
  quests/ leaderboard/ profile/ auth/ layout/ ui/
lib/
  lxp/client.ts        клиент GraphQL New LXP
  auth/session.ts      серверные сессии (cookie), привязка к пользователю
  game/                config, taps, anticheat, rate-limit, session, verification, quests, leaderboard, state
  db/                  схема Drizzle и подключение к Neon
legacy/                прежняя версия (статический index.html + Flask-шлюз), не используется
```

## Переменные окружения

| Переменная | Назначение |
| --- | --- |
| `DATABASE_URL` | строка подключения Neon (добавляется интеграцией Neon в Vercel) |
| `LXP_GRAPHQL_URL` | endpoint New LXP, по умолчанию `https://api.newlxp.ru/graphql` |
| `IP_HASH_SALT` | соль для хеширования IP в сессиях (задайте случайное значение в production) |

Параметры игры настраиваются без правки кода (значения по умолчанию в `lib/game/config.ts`):
`DAILY_TAP_LIMIT` (20000), `MAX_TAPS_PER_BATCH` (25), `BATCH_FLUSH_MS` (350), `API_RPM` (240),
`COOLDOWN_WINDOW_SEC` (30), `COOLDOWN_VERIFY_FAIL_SEC` (60), `RESTRICTED_SEC` (600), `VERIFY_TTL_SEC` (120),
`AUTH_SESSION_DAYS` (14), `HEARTBEAT_MS` (15000), `GAME_SESSION_TTL_SEC` (45), `LEADERBOARD_PAGE` (50).

## Локальный запуск

```bash
pnpm install
pnpm dev
```

Схема базы описана в `lib/db/schema.ts`; таблицы и стартовый набор квестов создаются при первой настройке проекта в Neon.

Новый квест — это строка в таблице `quests` с одной из метрик из `lib/game/quests.ts`: `total_taps`, `daily_taps`, `best_day_taps`, `streak_days`, `active_days`, `sessions_count`, `verifications_passed`, `bonus_points`, `quests_claimed`, `best_rank`. Код менять не нужно — прогресс, UI и получение награды подхватываются автоматически.

## Безопасность

- Пароль New LXP отправляется только на сервер игры и далее в New LXP; не логируется и не сохраняется.
- Все игровые изменения (тапы, квесты, награды) валидируются и считаются на сервере; клиент лишь отображает состояние.
- Rate limiting и античит работают на стороне API; дублирующиеся пачки тапов отбрасываются по `batchId`.
- Реальные учётные данные, токены и production-база в репозиторий не входят.

## Лицензия

Внутренний проект AK Project. Лицензия не назначена.
