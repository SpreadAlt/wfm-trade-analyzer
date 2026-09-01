import type { Locale } from './i18n'

export type InfoPageKind = 'privacy' | 'terms' | 'faq' | 'about' | 'contact'

const copy = {
  ru: {
    back: 'На главную', updated: 'Обновлено: 1 сентября 2026',
    privacy: {
      eyebrow: 'Документы', title: 'Политика конфиденциальности', intro: 'FrameAnalytics собирает только данные, необходимые для работы аккаунта, аналитики и закрытых торговых инструментов.',
      sections: [
        ['Какие данные используются', 'Адрес электронной почты и данные сессии нужны для входа. По желанию сохраняются имя профиля Warframe Market, добавленные покупки, настройки таблиц и выданные разрешения. Пароль хранится только в виде защищённого хеша.'],
        ['Технические данные', 'Для безопасности и диагностики могут кратковременно обрабатываться IP-адрес, тип браузера, время запроса, запрошенный маршрут и код ответа. Эти сведения не используются для торговли от имени пользователя.'],
        ['Сторонние сервисы', 'Сайт работает на инфраструктуре Cloudflare и получает публичные рыночные данные через API Warframe Market. Их собственные правила могут применяться при переходе на внешние страницы.'],
        ['Хранение и управление', 'Настройки интерфейса сохраняются в браузере. Данные аккаунта хранятся, пока аккаунт используется или пока их удаление не будет запрошено через канал связи проекта. Мы не продаём персональные данные.'],
        ['Связь', 'Вопрос об экспорте, исправлении или удалении данных можно отправить через публичный репозиторий проекта. Не публикуйте в обращении пароль, токен сессии или секретные ключи.']
      ]
    },
    terms: {
      eyebrow: 'Документы', title: 'Условия пользования', intro: 'Используя FrameAnalytics, вы соглашаетесь применять сервис законно и учитывать, что торговые решения всегда остаются за вами.',
      sections: [
        ['Назначение сервиса', 'FrameAnalytics анализирует публичные исторические данные и помогает сравнивать рыночные предложения. Сигналы, прогнозы и предполагаемая прибыль являются расчётными ориентирами, а не гарантией сделки или дохода.'],
        ['Аккаунт и безопасность', 'Вы отвечаете за доступ к своему аккаунту и достоверность указанных данных. Нельзя передавать чужие учётные данные, обходить ограничения доступа или пытаться получить закрытые функции без разрешения.'],
        ['Допустимая нагрузка', 'Запрещены автоматизированный сбор данных с сайта в обход доступного интерфейса, создание чрезмерной нагрузки и действия, способные нарушить лимиты Warframe Market или Cloudflare.'],
        ['Сделки', 'FrameAnalytics не является стороной сделки, не хранит платину и предметы и не изменяет ордера Warframe Market автоматически. Проверяйте цену, количество и имя игрока перед подтверждением обмена в игре.'],
        ['Доступность', 'Во время бета-теста функции и формат данных могут меняться, а отдельные инструменты — временно отключаться для защиты лимитов и целостности данных.']
      ]
    },
    faq: {
      eyebrow: 'Помощь', title: 'Частые вопросы', intro: 'Короткие ответы о ценах, сканерах и сохранении данных.',
      sections: [
        ['Почему цена отличается от текущих ордеров?', 'Основная аналитика строится по закрытой статистике рынка и почасовым наблюдениям. Активный ордер может исчезнуть до обновления, поэтому всегда проверяйте итоговую цену на Warframe Market.'],
        ['Что означает потенциальная прибыль?', 'Это разница между выбранной текущей ценой и статистической целью с учётом доступного периода. Комиссий в Warframe нет, но скорость продажи и фактический спрос не гарантируются.'],
        ['Зачем выбирать ранг предмета?', 'Разные ранги модов занимают отдельные рыночные серии и могут значительно отличаться по цене. Фильтр «все ранги» показывает их независимо.'],
        ['Как работают Smart Buy и советник?', 'Инструменты читают публичные ордера, группируют подходящих пользователей и готовят рекомендации. Они не отправляют сообщения и не создают сделки без вашего действия.'],
        ['Почему сканирование иногда ждёт?', 'Все процессы делят один безопасный шлюз запросов. Очередь защищает общий лимит API; результаты и сохранённые индексы при этом продолжают открываться без нового запроса к рынку.'],
        ['Где хранятся покупки?', 'После входа покупки синхронизируются с аккаунтом FrameAnalytics. Часть настроек отображения остаётся только в текущем браузере.']
      ]
    },
    about: {
      eyebrow: 'FrameAnalytics', title: 'О проекте', intro: 'FrameAnalytics — независимый аналитический интерфейс для исследования экономики Warframe.',
      sections: [
        ['Что мы делаем', 'Сервис объединяет закрытую статистику продаж, почасовые снимки и публичные ордера в таблицы, сканеры и персональные торговые инструменты.'],
        ['Принципы', 'Мы отделяем наблюдаемые данные от расчётных сигналов, показываем время обновления и ограничиваем внешние запросы единым шлюзом.'],
        ['Независимость', 'FrameAnalytics не связан с Digital Extremes и Warframe Market. Warframe и связанные названия принадлежат их правообладателям.']
      ]
    },
    contact: {
      eyebrow: 'Поддержка', title: 'Связаться с нами', intro: 'Для ошибок и предложений используйте репозиторий проекта — так обращение не потеряется и к нему можно приложить технические детали.',
      sections: [
        ['Сообщить об ошибке', 'Укажите страницу, точное время UTC, последовательность действий и текст ошибки. Скриншот полезен, но не должен содержать пароль, ключи или токен сессии.'],
        ['Предложить функцию', 'Опишите задачу пользователя и ожидаемый результат. Это помогает оценить пользу изменения без привязки к конкретному варианту интерфейса.']
      ]
    }
  },
  en: {
    back: 'Home', updated: 'Updated: September 1, 2026',
    privacy: { eyebrow: 'Documents', title: 'Privacy Policy', intro: 'FrameAnalytics collects only the data needed to operate accounts, analytics, and private trading tools.', sections: [
      ['Data we use', 'Email and session data are required for sign-in. Your Warframe Market profile name, saved purchases, table preferences, and granted permissions may be stored. Passwords are stored only as protected hashes.'],
      ['Technical data', 'IP address, browser type, request time, route, and response status may be processed briefly for security and diagnostics. This data is not used to trade on your behalf.'],
      ['Third-party services', 'The site runs on Cloudflare and obtains public market data through the Warframe Market API. Their own terms may apply when you follow external links.'],
      ['Storage and control', 'Interface preferences stay in your browser. Account data is kept while the account is in use or until deletion is requested through the project contact channel. We do not sell personal data.'],
      ['Contact', 'Requests to export, correct, or remove data can be sent through the public project repository. Never include passwords, session tokens, or secret keys.']
    ]},
    terms: { eyebrow: 'Documents', title: 'Terms of Use', intro: 'By using FrameAnalytics, you agree to use it lawfully and accept that every trading decision remains yours.', sections: [
      ['Purpose', 'FrameAnalytics analyzes public historical data and market offers. Signals, forecasts, and estimated profit are analytical guidance, not a guarantee of a trade or return.'],
      ['Account security', 'You are responsible for access to your account and the accuracy of supplied information. Do not use another person’s credentials or bypass access restrictions.'],
      ['Acceptable load', 'Automated scraping outside the provided interface, excessive load, and actions that can disrupt Warframe Market or Cloudflare limits are prohibited.'],
      ['Trades', 'FrameAnalytics is not a party to trades, does not hold Platinum or items, and does not edit Warframe Market orders automatically. Verify every trade in game.'],
      ['Availability', 'During beta, features and data formats may change and tools may be paused to protect limits and data integrity.']
    ]},
    faq: { eyebrow: 'Help', title: 'Frequently Asked Questions', intro: 'Short answers about prices, scanners, and stored data.', sections: [
      ['Why does a price differ from active orders?', 'Analytics uses closed market statistics and hourly observations. An active order may disappear before refresh, so verify the final price on Warframe Market.'],
      ['What is potential profit?', 'It is the gap between the selected current price and a statistical target for the chosen period. Demand and sale speed are not guaranteed.'],
      ['Why select an item rank?', 'Mod ranks are separate market series and can have very different prices. “All ranks” displays each independently.'],
      ['How do Smart Buy and Sell Advisor work?', 'They read public orders, group matching users, and prepare recommendations. They do not send messages or create trades without you.'],
      ['Why can a scan wait?', 'Every process shares one rate-safe request gateway. The queue protects the API limit while saved indexes remain available without a new market request.'],
      ['Where are purchases stored?', 'After sign-in, purchases sync with your FrameAnalytics account. Some display preferences stay only in the current browser.']
    ]},
    about: { eyebrow: 'FrameAnalytics', title: 'About', intro: 'FrameAnalytics is an independent analytics interface for exploring the Warframe economy.', sections: [
      ['What we do', 'The service combines closed-sale statistics, hourly snapshots, and public orders into tables, scanners, and personal trading tools.'],
      ['Principles', 'We separate observed data from calculated signals, show update times, and route external requests through one shared gateway.'],
      ['Independent project', 'FrameAnalytics is not affiliated with Digital Extremes or Warframe Market. Warframe and related names belong to their owners.']
    ]},
    contact: { eyebrow: 'Support', title: 'Contact', intro: 'Use the project repository for bugs and suggestions so reports remain traceable and can include technical detail.', sections: [
      ['Report a bug', 'Include the page, exact UTC time, steps, and error text. Screenshots help, but must not contain passwords, keys, or session tokens.'],
      ['Suggest a feature', 'Describe the user problem and expected result. This helps evaluate the benefit independently of a specific interface idea.']
    ]}
  }
} as const

export const InfoPage = ({ kind, locale }: { kind: InfoPageKind; locale: Locale }) => {
  const language = locale === 'ru' ? copy.ru : copy.en
  const page = language[kind]
  const repository = 'https://github.com/SpreadAlt/wfm-trade-analyzer'
  return <main className="app-shell info-page-shell">
    <div className="detail-navigation">
      <a className="brand-plate detail-brand" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.webp" alt="FrameAnalytics"/></a>
      <a className="back-button" href="/">← {language.back}</a>
    </div>
    <article className="panel info-document">
      <header><span className="eyebrow">{page.eyebrow}</span><h1>{page.title}</h1><p>{page.intro}</p><small>{language.updated}</small></header>
      <div className="info-sections">{page.sections.map(([title, body]) => <section key={title}><h2>{title}</h2><p>{body}</p>{kind === 'contact' && title === (locale === 'ru' ? 'Сообщить об ошибке' : 'Report a bug') ? <a href={repository} target="_blank" rel="noreferrer">GitHub · SpreadAlt/wfm-trade-analyzer ↗</a> : null}</section>)}</div>
    </article>
  </main>
}
