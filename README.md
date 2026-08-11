# WFM Trade Analyzer Web v0.1

Визуальный прототип без Supabase и без запросов к Warframe.market.

## Что уже есть

- Сканер покупки
- Сканер продажи
- Поиск
- Фильтр по потенциалу
- Фильтр по продажам за 24 часа
- Фильтр по оценке
- Сортировка по потенциалу
- Яркие решения
- Время обновления
- Страница предмета
- 48-часовой график Min / Median / Max / Продажи
- Адаптация под мобильный экран
- Тестовые данные

## Загрузка в GitHub

Загрузи все файлы из архива в корень репозитория `wfm-trade-analyzer`.

После загрузки структура репозитория должна начинаться так:

```text
wfm-trade-analyzer/
├── src/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```

## Локальный запуск

Нужен Node.js.

```bash
npm install
npm run dev
```

## Сборка

```bash
npm run build
```

Результат появится в папке `dist`.

## Cloudflare Pages

После того как проект загружен в GitHub:

1. Открой Cloudflare Dashboard.
2. Перейди в Workers & Pages.
3. Создай Pages-проект через импорт Git-репозитория.
4. Выбери `wfm-trade-analyzer`.
5. Framework preset: Vite.
6. Build command: `npm run build`.
7. Build output directory: `dist`.
8. Запусти deployment.

Supabase и Warframe.market API пока не нужны.
