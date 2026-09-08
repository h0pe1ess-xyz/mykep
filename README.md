<div align="center">
  <img alt="mykep" src="https://github.com/user-attachments/assets/58265975-c92d-46bf-bcec-cd4ea7f56cad" width="80" height="80" />
  <h1>MyKep 🎓</h1>
  <p><strong>PWA-клієнт розкладу для студентів ВСП «ФКЕП ІФНТУНГ» з підтримкою офлайн-режиму</strong></p>
  
  <p>
    <img src="https://img.shields.io/badge/Python-3.12+-blue.svg?logo=python&logoColor=white" alt="Python">
    <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI">
    <img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite">
    <img src="https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white" alt="PWA">
    <img src="https://img.shields.io/badge/Vanilla_JS-F7DF1E?logo=javascript&logoColor=black" alt="JS">
  </p>
</div>

<br/>

> **MyKep** - веб-додаток для швидкого та зручного перегляду розкладу занять. Забезпечує автономну роботу без доступу до інтернету, локальне кешування та встановлення на iOS і Android як повноцінний нативний застосунок.

## 📱 Інтерфейс

<div align="center">
  <img src="https://github.com/user-attachments/assets/f4d58cb6-d6d8-4fe9-9fe4-043ed57dfd80" alt="Dashboard" width="22%">
  &nbsp;
  <img src="https://github.com/user-attachments/assets/4c4c9d6c-6d96-459d-9772-8d85799d8598" alt="Schedule" width="22%">
  &nbsp;
  <img src="https://github.com/user-attachments/assets/41cfa07c-ff31-47b6-b5eb-e6dad7de0d8d" alt="Settings" width="22%">
  &nbsp;
</div>

---

## ⚙️ Функціональні можливості та архітектура

### Backend
* **Парсинг даних:** коректна взаємодія з Cloudflare (`cloudscraper`), вилучення вбудованих JS-структур (`chompjs`) та нормалізація нестандартних форматів номерів тижнів (наприклад `"2/4"`, `"2 та 4"`, `"всі"`)
* **Кешування запитів:** збереження розкладу в SQLite для мінімізації навантаження на першоджерело та прискорення відповіді клієнту
* **Відмовостійкість:** у разі недоступності сайту коледжу API повертає останню успішно збережену копію даних

### Frontend & PWA
* **Автономний режим:** завдяки Service Worker (`sw.js`) та `localStorage` збережений розклад залишається доступним за повної відсутності мережі
* **Оптимізація під мобільні платформи:** адаптація під системні вирізи Safe Area на iOS та Android, тематизація статус-бара і робота в режимі SPA без зайвих перезавантажень
* **Інтерфейс:** темна тема, плавні переходи та компактне відображення розкладу на поточний день і тиждень

---

## 🛠 Стек технологій

| Компонент | Технології | Призначення |
| :--- | :--- | :--- |
| **Backend** | `FastAPI`, `Uvicorn`, `Python` | Асинхронний сервер, маршрутизація та бізнес-логіка |
| **Scraper** | `cloudscraper`, `chompjs`, `re` | Збір, очищення та нормалізація розкладу |
| **Database** | `aiosqlite` | Асинхронне локальне сховище для кешування |
| **Frontend** | `HTML5`, `CSS3`, `Vanilla JS` | Клієнтська логіка без сторонніх фреймворків |

---

## 🚀 Встановлення та запуск

1. **Клонувати репозиторій:**
   ```bash
   git clone [https://github.com/h0pe1ess-xyz/mykep.git](https://github.com/h0pe1ess-xyz/mykep.git)
   cd mykep
