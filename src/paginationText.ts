import type { Locale } from './i18n'

export type PaginationText = {
  perPage: string
  page: string
  of: string
  previous: string
  next: string
  first: string
  last: string
  showing: string
}

export const paginationText: Record<Locale, PaginationText> = {
  en: { perPage: 'Per page', page: 'Page', of: 'of', previous: 'Previous', next: 'Next', first: 'First', last: 'Last', showing: 'Showing' },
  ru: { perPage: 'На странице', page: 'Страница', of: 'из', previous: 'Назад', next: 'Вперёд', first: 'Первая', last: 'Последняя', showing: 'Показано' },
  de: { perPage: 'Pro Seite', page: 'Seite', of: 'von', previous: 'Zurück', next: 'Weiter', first: 'Erste', last: 'Letzte', showing: 'Angezeigt' },
  fr: { perPage: 'Par page', page: 'Page', of: 'sur', previous: 'Précédente', next: 'Suivante', first: 'Première', last: 'Dernière', showing: 'Affichés' },
  es: { perPage: 'Por página', page: 'Página', of: 'de', previous: 'Anterior', next: 'Siguiente', first: 'Primera', last: 'Última', showing: 'Mostrando' },
  pt: { perPage: 'Por página', page: 'Página', of: 'de', previous: 'Anterior', next: 'Seguinte', first: 'Primeira', last: 'Última', showing: 'Mostrando' },
  pl: { perPage: 'Na stronę', page: 'Strona', of: 'z', previous: 'Wstecz', next: 'Dalej', first: 'Pierwsza', last: 'Ostatnia', showing: 'Wyświetlono' },
  uk: { perPage: 'На сторінці', page: 'Сторінка', of: 'з', previous: 'Назад', next: 'Далі', first: 'Перша', last: 'Остання', showing: 'Показано' },
  tr: { perPage: 'Sayfa başına', page: 'Sayfa', of: '/', previous: 'Önceki', next: 'Sonraki', first: 'İlk', last: 'Son', showing: 'Gösterilen' },
  it: { perPage: 'Per pagina', page: 'Pagina', of: 'di', previous: 'Precedente', next: 'Successiva', first: 'Prima', last: 'Ultima', showing: 'Visualizzati' },
  sv: { perPage: 'Per sida', page: 'Sida', of: 'av', previous: 'Föregående', next: 'Nästa', first: 'Första', last: 'Sista', showing: 'Visar' },
  cs: { perPage: 'Na stránku', page: 'Stránka', of: 'z', previous: 'Předchozí', next: 'Další', first: 'První', last: 'Poslední', showing: 'Zobrazeno' },
  ja: { perPage: '1ページ', page: 'ページ', of: '/', previous: '前へ', next: '次へ', first: '最初', last: '最後', showing: '表示' },
  ko: { perPage: '페이지당', page: '페이지', of: '/', previous: '이전', next: '다음', first: '처음', last: '마지막', showing: '표시' },
  'zh-hans': { perPage: '每页', page: '页', of: '/', previous: '上一页', next: '下一页', first: '首页', last: '末页', showing: '显示' },
  'zh-hant': { perPage: '每頁', page: '頁', of: '/', previous: '上一頁', next: '下一頁', first: '首頁', last: '末頁', showing: '顯示' }
}
