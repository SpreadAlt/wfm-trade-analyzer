export const localeNames = {
  en: 'English',
  ru: 'Русский',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  pt: 'Português',
  pl: 'Polski',
  uk: 'Українська',
  tr: 'Türkçe',
  it: 'Italiano',
  sv: 'Svenska',
  cs: 'Čeština',
  ja: '日本語',
  ko: '한국어',
  'zh-hans': '简体中文',
  'zh-hant': '繁體中文'
} as const

export type Locale = keyof typeof localeNames
export type Theme = 'system' | 'light' | 'dark'

const en = {
  subtitle:'Find strong buy and sell zones using closed market statistics.', dataFresh:'Data is up to date', buy:'Buy', sell:'Sell', name:'Name', searchPlaceholder:'Item name...', minPrice:'Minimum price', potentialFrom:'Potential from', found:'Found', item:'Item', current:'Current', change1h:'Change 1h', change24h:'Change 24h', change7d:'Change 7d', sales24h:'Sales 24h', potential:'Potential', score:'Score', decision:'Decision', updated:'Updated', back:'← Back to scanner', buyPotential:'Buy potential', sellPotential:'Sell potential', closedSales:'Closed sales', price48h:'Price over the last 48 hours', min:'Min', median:'Median', max:'Max', sales:'Sales', settingsInfo:'Settings and information', language:'Language', theme:'Theme', links:'Links', project:'Project', themeSystem:'System', themeLight:'Light', themeDark:'Dark', sourceMarket:'Warframe.market', version:'Version', disclaimer:'Unofficial community analytics project. Not affiliated with Digital Extremes or Warframe.market.', categoryPrimeWeapon:'Prime Weapon', categoryPrimeWarframe:'Prime Warframe', categoryPrimedMod:'Primed Mod', categoryBaroWeapon:'Baro Weapon', decisionBuyStrong:'● GOOD TIME TO BUY', decisionSellStrong:'● GOOD TIME TO SELL', decisionBuyFalling:'○ PRICE MAY FALL', decisionBuyWatch:'○ WATCH FOR BUY', decisionSellRising:'○ PRICE MAY RISE', decisionSellWatch:'○ WATCH FOR SELL', decisionLow:'● LOW PRIORITY'
} as const

export type TranslationKey = keyof typeof en

const ru: Record<TranslationKey,string> = {
  subtitle:'Поиск сильных зон покупки и продажи по закрытой статистике рынка.', dataFresh:'Данные актуальны', buy:'Покупка', sell:'Продажа', name:'Название', searchPlaceholder:'Название предмета...', minPrice:'Минимальная цена', potentialFrom:'Потенциал от', found:'Найдено', item:'Предмет', current:'Сейчас', change1h:'Изм. 1ч', change24h:'Изм. 24ч', change7d:'Изм. 7д', sales24h:'Продажа 24ч', potential:'Потенциал', score:'Оценка', decision:'Решение', updated:'Обновлено', back:'← Назад к сканеру', buyPotential:'Потенциал покупки', sellPotential:'Потенциал продажи', closedSales:'Закрытые продажи', price48h:'Цена за последние 48 часов', min:'Мин', median:'Медиана', max:'Макс', sales:'Продажи', settingsInfo:'Настройки и информация', language:'Язык', theme:'Тема', links:'Ссылки', project:'Проект', themeSystem:'Системная', themeLight:'Светлая', themeDark:'Тёмная', sourceMarket:'Warframe.market', version:'Версия', disclaimer:'Неофициальный аналитический проект сообщества. Не связан с Digital Extremes или Warframe.market.', categoryPrimeWeapon:'Прайм оружие', categoryPrimeWarframe:'Прайм варфрейм', categoryPrimedMod:'Прайм мод', categoryBaroWeapon:'Оружие Баро', decisionBuyStrong:'● ВЫГОДНО ПОКУПАТЬ', decisionSellStrong:'● ВЫГОДНО ПРОДАВАТЬ', decisionBuyFalling:'○ ЦЕНА МОЖЕТ УПАСТЬ', decisionBuyWatch:'○ СЛЕДИТЬ ЗА ПОКУПКОЙ', decisionSellRising:'○ ЦЕНА МОЖЕТ ВЫРАСТИ', decisionSellWatch:'○ СЛЕДИТЬ ЗА ПРОДАЖЕЙ', decisionLow:'● НИЗКИЙ ПРИОРИТЕТ'
}

export const translations: Record<Locale, Record<TranslationKey,string>> = {
  en, ru, de:en, fr:en, es:en, pt:en, pl:en, uk:ru, tr:en, it:en, sv:en, cs:en, ja:en, ko:en, 'zh-hans':en, 'zh-hant':en
}
