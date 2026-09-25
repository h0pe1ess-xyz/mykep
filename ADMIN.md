# MyKep Admin (`/admin`)

Окрема PWA-адмінка: статус сервера, уся статистика з графіками, безпека.
Звичайний сайт для студентів не змінився, кнопки в налаштуваннях **немає**
(щоб ніхто не знав, що адмінка існує). Вхід: відкрити `https://mykep.pp.ua/admin`
у Safari/Chrome і «Додати на головний екран», тоді з'явиться окрема іконка «MyKep Admin».

## Доступ
* Вхід через **Telegram Login**. Пускає лише ID `1125085502` та `1320649428`
  (жорстко в `config.py`, змінною `.env` список можна лише звузити).
* Потрібен `TELEGRAM_BOT_TOKEN` і в @BotFather → `/setdomain` → `mykep.pp.ua`
  (на тестовому сервері його домен). На `localhost` Telegram Login не працює,
  тому локально є `ADMIN_DEV_LOGIN=1`.
* **iPhone PWA:** iOS ізолює cookie PWA від Safari. Тому: увійти в Safari →
  «Безпека» → «Код входу» → ввести одноразовий код у PWA (3 хв, одноразовий).
* Аварійний вхід із консолі сервера: `python admin_cli.py code 1125085502`,
  розлогінити всіх: `python admin_cli.py revoke-all`.

## Розділи
* **Огляд:** статус сервера, онлайн зараз (5/15/60 хв), сьогодні, DAU/WAU/MAU,
  охоплення коледжу (з 1200), топ груп, графік за 30 днів.
* **Статистика** (сьогодні / 7 / 30 / 90 днів / весь час): перегляди й унікальні по днях,
  heatmap день×година, погодинно, по 15 хв, пари/перерви, пікові години,
  утримання D1/D7, спеціальності, курси, групи, пристрої, браузери, PWA vs браузер,
  нові користувачі, експорт CSV.
* **Сервер:** аптайм, CPU, RAM, диск, розмір БД, запити/помилки/латентність p50/p95,
  лаг event loop, стан розкладу й кнопка «оновити розклад», стан запису аналітики.
* **Безпека:** активні сесії (з відкликанням), журнал входів, код входу для PWA.

Стара статистика **не видаляється**: таблиця `analytics` лише отримала нову
колонку `display_mode` (старі записи = «невідомо»).

## Захист
* Сесія: 256-біт токен, у БД тільки SHA-256; cookie `__Host-`, HttpOnly, Secure,
  SameSite=Strict; абсолютний термін 7 днів + тайм-аут неактивності 72 год.
* Telegram-підпис HMAC-SHA256, свіжість ≤ 5 хв, кожен підпис одноразовий (anti-replay).
* CSRF-токен + перевірка Origin на кожен POST.
* Rate limit: логін, коди (на IP і глобально), API на сесію, важкі дії.
* XSS: жодного `innerHTML` в адмінці, лише `textContent`; CSP без inline-скриптів +
  Trusted Types; публічний сайт теж отримав CSP (inline `onclick` прибрано).
* `X-Frame-Options: DENY`, `frame-ancestors 'none'`, HSTS, COOP, CORP,
  `Permissions-Policy`, `noindex`. Swagger `/docs` вимкнено.
* Статика адмінки віддається тільки за allowlist імен (без path traversal).
  SQL лише параметризований.
* Журнал аудиту всіх входів, невдалих спроб і дій.
* `/api/health` більше не показує внутрішні деталі.

## Бот
Вимкнений за замовчуванням (`BOT_MODE=disabled`), код лишився. Увімкнути назад:
`BOT_MODE=embedded`. Коли адмінка стабільна, `bot.py` можна видалити.

## Локальний запуск
```
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# .env:  ADMIN_COOKIE_SECURE=0  ADMIN_DEV_LOGIN=1  BOT_MODE=disabled
python main.py                           # http://127.0.0.1:8000/admin/
# або з демо-даними (реальну schedule.db не чіпає):
python scripts/seed_demo_analytics.py demo.db --days 21 --users 350
MYKEP_DB_PATH=demo.db python main.py
```

## Важливо для деплою
* `ADMIN_PUBLIC_ORIGIN` задавайте лише на продакшні (`https://mykep.pp.ua`). Якщо домен не збігається
  з тим, де відкрито /admin, усі дії в адмінці повертатимуть 403. На тестовому сервері не задавайте.
* `ADMIN_DEV_LOGIN=1` сервер ігнорує, поки `ADMIN_COOKIE_SECURE` не дорівнює `0`.
