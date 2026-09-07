<div align="center">
  <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Graduation%20Cap.png" alt="Graduation Cap" width="80" height="80" />
  <h1>MyKep 🎓</h1>
  <p><strong>Сучасний, швидкий та автономний PWA-розклад для студентів КЕП ІФНТУНГ.</strong></p>
  
  <p>
    <img src="https://img.shields.io/badge/Python-3.12+-blue.svg?logo=python&logoColor=white" alt="Python">
    <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI">
    <img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite">
    <img src="https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white" alt="PWA">
    <img src="https://img.shields.io/badge/Vanilla_JS-F7DF1E?logo=javascript&logoColor=black" alt="JS">
  </p>
</div>

<br/>

> **MyKep** — це не просто парсер. Це повноцінний веб-додаток, який рятує студентів від хаосу з розкладами, "падаючого" сайту коледжу та заплутаних тижнів. Він кешує дані, працює без інтернету і виглядає як дорогий нативний додаток на iOS та Android.

## 📱 Скріншоти

<div align="center">
  <!-- ⚠️ ЗАМІНИ ЦІ ПОСИЛАННЯ НА СВОЇ КАРТИНКИ (можеш просто перетягнути їх у вікно редагування GitHub) -->
  <img src="https://placehold.co/250x500/110c0a/ff5500?text=Головний+Екран" alt="Dashboard" width="22%">
  &nbsp;
  <img src="https://placehold.co/250x500/110c0a/ff5500?text=Розклад+на+Тиждень" alt="Schedule" width="22%">
  &nbsp;
  <img src="https://placehold.co/250x500/110c0a/ff5500?text=Налаштування" alt="Settings" width="22%">
  &nbsp;
</div>

---

## 🔥 Головні фічі

### 🚀 «Бронебійний» Бекенд
* **Розумний парсер:** Обходить захист Cloudflare (`cloudscraper`), дістає сирі JS-об'єкти (`chompjs`) і вміє читати навіть найкривіше заповнені тижні (напр. `"2/4"`, `"2 та 4"`, `"всі"`).
* **SQLite Кешування:** Сервер не спамить запитами сайт коледжу. Дані зберігаються в локальну БД і оновлюються автоматично.
* **Стійкість до помилок:** Якщо сайт коледжу "ліг", API все одно миттєво віддасть останній збережений розклад.

### ⚡ Native-like PWA (Фронтенд)
* **Повний Офлайн:** Завдяки кастомному Service Worker (`sw.js`) та `localStorage`, додаток працює навіть в укритті без зв'язку.
* **Apple & Android Ready:** Налаштовані Safe Area (відступи під "чубчик" та нижню смужку), статус-бар кольору фону та безшовна навігація без перезавантаження сторінок.
* **Glassmorphism UI:** Сучасний темний дизайн з напівпрозорими картками, мікроанімаціями та "масляним" скролом.

---

## 🛠 Технічний стек

| Компонент | Технології | Опис |
| :--- | :--- | :--- |
| **Backend** | `FastAPI`, `Uvicorn`, `Python` | Асинхронне API, обробка роутів, збір статистики. |
| **Scraper** | `cloudscraper`, `chompjs`, `re` | Екстракція даних безпосередньо з DOM/JS сайту коледжу. |
| **Database** | `aiosqlite` | Легка асинхронна база для кешування пар та аналітики. |
| **Frontend** | `HTML5`, `CSS3`, `Vanilla JS` | Без фреймворків. Тільки швидкість, CSS-змінні та DOM API. |

---

## ⚙️ Встановлення та запуск (VPS / Local)

1. **Клонуй репозиторій:**
   ```bash
   git clone [https://github.com/ТВІЙ_ЮЗЕРНЕЙМ/mykep.git](https://github.com/ТВІЙ_ЮЗЕРНЕЙМ/mykep.git)
   cd mykep
