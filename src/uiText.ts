import type { Locale } from './i18n'

export type UiText = {
  platform: string
  analysisPeriod: string
  categories: string
  defaults: string
  selectAll: string
  clear: string
  crossplay: string
  unavailable: string
  loading: string
  loadError: string
  retry: string
  noData: string
  dataDate: string
  priceHistory: string
  range30d: string
  range90d: string
  analysisWindow: string
  baseline: string
  q25: string
  q75: string
  volatility: string
  primeSets: string
  primeBlueprints: string
  primeParts: string
  primedMods: string
  rareMods: string
  otherMods: string
  relics: string
  weapons: string
  cosmetics: string
  arcanes: string
  resources: string
  archwing: string
  companions: string
  necramechs: string
  equipment: string
  collectibles: string
  ayatan: string
  utility: string
  misc: string
  syndicate: string
}

export const uiText: Record<Locale, UiText> = {
  en: {
    platform: 'Platform', analysisPeriod: 'Analysis period', categories: 'Categories', defaults: 'Defaults', selectAll: 'All', clear: 'Clear', crossplay: 'Crossplay', unavailable: 'Unavailable', loading: 'Loading data…', loadError: 'Could not load market data', retry: 'Retry', noData: 'No items match the current filters.', dataDate: 'Data', priceHistory: 'Price history', range30d: '30d', range90d: '90d', analysisWindow: 'Analysis window', baseline: 'Baseline', q25: 'Q25', q75: 'Q75', volatility: 'Volatility', primeSets: 'Prime Sets', primeBlueprints: 'Prime Blueprints', primeParts: 'Prime Parts', primedMods: 'Primed Mods', rareMods: 'Rare Mods', otherMods: 'Other Mods', relics: 'Relics', weapons: 'Weapons', cosmetics: 'Cosmetics', arcanes: 'Arcanes', resources: 'Resources', archwing: 'Archwing', companions: 'Companions', necramechs: 'Necramechs', equipment: 'Equipment', collectibles: 'Collectibles', ayatan: 'Ayatan', utility: 'Utility', misc: 'Misc', syndicate: 'Syndicate'
  },
  ru: {
    platform: 'Платформа', analysisPeriod: 'Период анализа', categories: 'Категории', defaults: 'По умолчанию', selectAll: 'Все', clear: 'Очистить', crossplay: 'Кроссплей', unavailable: 'Недоступно', loading: 'Загрузка данных…', loadError: 'Не удалось загрузить данные рынка', retry: 'Повторить', noData: 'По текущим фильтрам предметы не найдены.', dataDate: 'Данные', priceHistory: 'История цены', range30d: '30д', range90d: '90д', analysisWindow: 'Окно анализа', baseline: 'Базовая цена', q25: 'Q25', q75: 'Q75', volatility: 'Волатильность', primeSets: 'Прайм наборы', primeBlueprints: 'Прайм чертежи', primeParts: 'Прайм части', primedMods: 'Прайм моды', rareMods: 'Редкие моды', otherMods: 'Другие моды', relics: 'Реликвии', weapons: 'Оружие', cosmetics: 'Косметика', arcanes: 'Мистификаторы', resources: 'Ресурсы', archwing: 'Арчвинг', companions: 'Компаньоны', necramechs: 'Некрамехи', equipment: 'Снаряжение', collectibles: 'Коллекционное', ayatan: 'Аятан', utility: 'Расходники и ключи', misc: 'Прочее', syndicate: 'Синдикат'
  },
  de: {
    platform: 'Plattform', analysisPeriod: 'Analysezeitraum', categories: 'Kategorien', defaults: 'Standard', selectAll: 'Alle', clear: 'Leeren', crossplay: 'Crossplay', unavailable: 'Nicht verfügbar', loading: 'Daten werden geladen…', loadError: 'Marktdaten konnten nicht geladen werden', retry: 'Erneut versuchen', noData: 'Keine Gegenstände entsprechen den Filtern.', dataDate: 'Daten', priceHistory: 'Preisverlauf', range30d: '30 T.', range90d: '90 T.', analysisWindow: 'Analysefenster', baseline: 'Basiswert', q25: 'Q25', q75: 'Q75', volatility: 'Volatilität', primeSets: 'Prime-Sets', primeBlueprints: 'Prime-Blaupausen', primeParts: 'Prime-Teile', primedMods: 'Primed Mods', rareMods: 'Seltene Mods', otherMods: 'Andere Mods', relics: 'Relikte', weapons: 'Waffen', cosmetics: 'Kosmetik', arcanes: 'Arkanas', resources: 'Ressourcen', archwing: 'Archwing', companions: 'Begleiter', necramechs: 'Necramechs', equipment: 'Ausrüstung', collectibles: 'Sammlerstücke', ayatan: 'Ayatan', utility: 'Nützliches', misc: 'Sonstiges', syndicate: 'Syndikat'
  },
  fr: {
    platform: 'Plateforme', analysisPeriod: 'Période d’analyse', categories: 'Catégories', defaults: 'Par défaut', selectAll: 'Toutes', clear: 'Effacer', crossplay: 'Cross-play', unavailable: 'Indisponible', loading: 'Chargement des données…', loadError: 'Impossible de charger les données du marché', retry: 'Réessayer', noData: 'Aucun objet ne correspond aux filtres.', dataDate: 'Données', priceHistory: 'Historique des prix', range30d: '30 j', range90d: '90 j', analysisWindow: 'Fenêtre d’analyse', baseline: 'Référence', q25: 'Q25', q75: 'Q75', volatility: 'Volatilité', primeSets: 'Ensembles Prime', primeBlueprints: 'Plans Prime', primeParts: 'Pièces Prime', primedMods: 'Mods Prime', rareMods: 'Mods rares', otherMods: 'Autres mods', relics: 'Reliques', weapons: 'Armes', cosmetics: 'Cosmétiques', arcanes: 'Arcanes', resources: 'Ressources', archwing: 'Archwing', companions: 'Compagnons', necramechs: 'Necramechs', equipment: 'Équipement', collectibles: 'Objets de collection', ayatan: 'Ayatan', utility: 'Utilitaires', misc: 'Divers', syndicate: 'Syndicat'
  },
  es: {
    platform: 'Plataforma', analysisPeriod: 'Periodo de análisis', categories: 'Categorías', defaults: 'Predeterminadas', selectAll: 'Todas', clear: 'Limpiar', crossplay: 'Juego cruzado', unavailable: 'No disponible', loading: 'Cargando datos…', loadError: 'No se pudieron cargar los datos del mercado', retry: 'Reintentar', noData: 'Ningún objeto coincide con los filtros.', dataDate: 'Datos', priceHistory: 'Historial de precios', range30d: '30 d', range90d: '90 d', analysisWindow: 'Ventana de análisis', baseline: 'Base', q25: 'Q25', q75: 'Q75', volatility: 'Volatilidad', primeSets: 'Sets Prime', primeBlueprints: 'Planos Prime', primeParts: 'Partes Prime', primedMods: 'Mods Prime', rareMods: 'Mods raros', otherMods: 'Otros mods', relics: 'Reliquias', weapons: 'Armas', cosmetics: 'Cosméticos', arcanes: 'Arcanos', resources: 'Recursos', archwing: 'Archwing', companions: 'Compañeros', necramechs: 'Necramechs', equipment: 'Equipo', collectibles: 'Coleccionables', ayatan: 'Ayatan', utility: 'Utilidad', misc: 'Varios', syndicate: 'Sindicato'
  },
  pt: {
    platform: 'Plataforma', analysisPeriod: 'Período de análise', categories: 'Categorias', defaults: 'Padrão', selectAll: 'Todas', clear: 'Limpar', crossplay: 'Jogo cruzado', unavailable: 'Indisponível', loading: 'Carregando dados…', loadError: 'Não foi possível carregar os dados do mercado', retry: 'Tentar novamente', noData: 'Nenhum item corresponde aos filtros.', dataDate: 'Dados', priceHistory: 'Histórico de preços', range30d: '30 d', range90d: '90 d', analysisWindow: 'Janela de análise', baseline: 'Referência', q25: 'Q25', q75: 'Q75', volatility: 'Volatilidade', primeSets: 'Conjuntos Prime', primeBlueprints: 'Projetos Prime', primeParts: 'Partes Prime', primedMods: 'Mods Primed', rareMods: 'Mods raros', otherMods: 'Outros mods', relics: 'Relíquias', weapons: 'Armas', cosmetics: 'Cosméticos', arcanes: 'Arcanos', resources: 'Recursos', archwing: 'Archwing', companions: 'Companheiros', necramechs: 'Necramechs', equipment: 'Equipamento', collectibles: 'Colecionáveis', ayatan: 'Ayatan', utility: 'Utilidade', misc: 'Diversos', syndicate: 'Sindicato'
  },
  pl: {
    platform: 'Platforma', analysisPeriod: 'Okres analizy', categories: 'Kategorie', defaults: 'Domyślne', selectAll: 'Wszystkie', clear: 'Wyczyść', crossplay: 'Gra międzyplatformowa', unavailable: 'Niedostępne', loading: 'Wczytywanie danych…', loadError: 'Nie udało się wczytać danych rynku', retry: 'Ponów', noData: 'Brak przedmiotów pasujących do filtrów.', dataDate: 'Dane', priceHistory: 'Historia ceny', range30d: '30 d', range90d: '90 d', analysisWindow: 'Okno analizy', baseline: 'Poziom bazowy', q25: 'Q25', q75: 'Q75', volatility: 'Zmienność', primeSets: 'Zestawy Prime', primeBlueprints: 'Schematy Prime', primeParts: 'Części Prime', primedMods: 'Mody Primed', rareMods: 'Rzadkie mody', otherMods: 'Inne mody', relics: 'Relikty', weapons: 'Broń', cosmetics: 'Kosmetyka', arcanes: 'Arkana', resources: 'Zasoby', archwing: 'Archwing', companions: 'Towarzysze', necramechs: 'Necramechy', equipment: 'Wyposażenie', collectibles: 'Kolekcjonerskie', ayatan: 'Ayatan', utility: 'Użytkowe', misc: 'Inne', syndicate: 'Syndykat'
  },
  uk: {
    platform: 'Платформа', analysisPeriod: 'Період аналізу', categories: 'Категорії', defaults: 'Типові', selectAll: 'Усі', clear: 'Очистити', crossplay: 'Кросплей', unavailable: 'Недоступно', loading: 'Завантаження даних…', loadError: 'Не вдалося завантажити дані ринку', retry: 'Повторити', noData: 'За поточними фільтрами предметів не знайдено.', dataDate: 'Дані', priceHistory: 'Історія ціни', range30d: '30д', range90d: '90д', analysisWindow: 'Вікно аналізу', baseline: 'Базова ціна', q25: 'Q25', q75: 'Q75', volatility: 'Волатильність', primeSets: 'Прайм набори', primeBlueprints: 'Прайм креслення', primeParts: 'Прайм частини', primedMods: 'Прайм моди', rareMods: 'Рідкісні моди', otherMods: 'Інші моди', relics: 'Реліквії', weapons: 'Зброя', cosmetics: 'Косметика', arcanes: 'Містифікатори', resources: 'Ресурси', archwing: 'Арчвінг', companions: 'Компаньйони', necramechs: 'Некрамехи', equipment: 'Спорядження', collectibles: 'Колекційне', ayatan: 'Аятан', utility: 'Допоміжне', misc: 'Інше', syndicate: 'Синдикат'
  },
  tr: {
    platform: 'Platform', analysisPeriod: 'Analiz dönemi', categories: 'Kategoriler', defaults: 'Varsayılanlar', selectAll: 'Tümü', clear: 'Temizle', crossplay: 'Çapraz oyun', unavailable: 'Kullanılamıyor', loading: 'Veriler yükleniyor…', loadError: 'Pazar verileri yüklenemedi', retry: 'Tekrar dene', noData: 'Filtrelerle eşleşen öğe yok.', dataDate: 'Veri', priceHistory: 'Fiyat geçmişi', range30d: '30g', range90d: '90g', analysisWindow: 'Analiz aralığı', baseline: 'Temel değer', q25: 'Q25', q75: 'Q75', volatility: 'Oynaklık', primeSets: 'Prime Setleri', primeBlueprints: 'Prime Planları', primeParts: 'Prime Parçaları', primedMods: 'Primed Modlar', rareMods: 'Nadir Modlar', otherMods: 'Diğer Modlar', relics: 'Relikler', weapons: 'Silahlar', cosmetics: 'Kozmetikler', arcanes: 'Arcane’ler', resources: 'Kaynaklar', archwing: 'Archwing', companions: 'Yoldaşlar', necramechs: 'Necramech’ler', equipment: 'Ekipman', collectibles: 'Koleksiyonluklar', ayatan: 'Ayatan', utility: 'Yardımcı', misc: 'Diğer', syndicate: 'Sendika'
  },
  it: {
    platform: 'Piattaforma', analysisPeriod: 'Periodo di analisi', categories: 'Categorie', defaults: 'Predefinite', selectAll: 'Tutte', clear: 'Pulisci', crossplay: 'Crossplay', unavailable: 'Non disponibile', loading: 'Caricamento dati…', loadError: 'Impossibile caricare i dati di mercato', retry: 'Riprova', noData: 'Nessun oggetto corrisponde ai filtri.', dataDate: 'Dati', priceHistory: 'Storico prezzi', range30d: '30 g', range90d: '90 g', analysisWindow: 'Finestra di analisi', baseline: 'Riferimento', q25: 'Q25', q75: 'Q75', volatility: 'Volatilità', primeSets: 'Set Prime', primeBlueprints: 'Progetti Prime', primeParts: 'Parti Prime', primedMods: 'Mod Primed', rareMods: 'Mod rare', otherMods: 'Altre mod', relics: 'Reliquie', weapons: 'Armi', cosmetics: 'Cosmetici', arcanes: 'Arcani', resources: 'Risorse', archwing: 'Archwing', companions: 'Compagni', necramechs: 'Necramech', equipment: 'Equipaggiamento', collectibles: 'Collezionabili', ayatan: 'Ayatan', utility: 'Utilità', misc: 'Varie', syndicate: 'Sindacato'
  },
  sv: {
    platform: 'Plattform', analysisPeriod: 'Analysperiod', categories: 'Kategorier', defaults: 'Standard', selectAll: 'Alla', clear: 'Rensa', crossplay: 'Crossplay', unavailable: 'Inte tillgängligt', loading: 'Laddar data…', loadError: 'Kunde inte läsa in marknadsdata', retry: 'Försök igen', noData: 'Inga föremål matchar filtren.', dataDate: 'Data', priceHistory: 'Prishistorik', range30d: '30 d', range90d: '90 d', analysisWindow: 'Analysfönster', baseline: 'Basnivå', q25: 'Q25', q75: 'Q75', volatility: 'Volatilitet', primeSets: 'Prime-set', primeBlueprints: 'Prime-ritningar', primeParts: 'Prime-delar', primedMods: 'Primed-mods', rareMods: 'Sällsynta mods', otherMods: 'Andra mods', relics: 'Reliker', weapons: 'Vapen', cosmetics: 'Kosmetik', arcanes: 'Arcanes', resources: 'Resurser', archwing: 'Archwing', companions: 'Följeslagare', necramechs: 'Necramechs', equipment: 'Utrustning', collectibles: 'Samlarföremål', ayatan: 'Ayatan', utility: 'Verktyg', misc: 'Övrigt', syndicate: 'Syndikat'
  },
  cs: {
    platform: 'Platforma', analysisPeriod: 'Období analýzy', categories: 'Kategorie', defaults: 'Výchozí', selectAll: 'Vše', clear: 'Vymazat', crossplay: 'Crossplay', unavailable: 'Nedostupné', loading: 'Načítání dat…', loadError: 'Nepodařilo se načíst tržní data', retry: 'Zkusit znovu', noData: 'Žádné předměty neodpovídají filtrům.', dataDate: 'Data', priceHistory: 'Historie ceny', range30d: '30 d', range90d: '90 d', analysisWindow: 'Okno analýzy', baseline: 'Základ', q25: 'Q25', q75: 'Q75', volatility: 'Volatilita', primeSets: 'Prime sety', primeBlueprints: 'Prime blueprinty', primeParts: 'Prime části', primedMods: 'Primed mody', rareMods: 'Vzácné mody', otherMods: 'Ostatní mody', relics: 'Relikvie', weapons: 'Zbraně', cosmetics: 'Kosmetika', arcanes: 'Arcany', resources: 'Zdroje', archwing: 'Archwing', companions: 'Společníci', necramechs: 'Necramechové', equipment: 'Vybavení', collectibles: 'Sběratelské', ayatan: 'Ayatan', utility: 'Užitkové', misc: 'Ostatní', syndicate: 'Syndikát'
  },
  ja: {
    platform: 'プラットフォーム', analysisPeriod: '分析期間', categories: 'カテゴリ', defaults: '既定', selectAll: 'すべて', clear: 'クリア', crossplay: 'クロスプレイ', unavailable: '利用不可', loading: 'データを読み込み中…', loadError: 'マーケットデータを読み込めませんでした', retry: '再試行', noData: '現在のフィルターに一致するアイテムはありません。', dataDate: 'データ', priceHistory: '価格履歴', range30d: '30日', range90d: '90日', analysisWindow: '分析期間', baseline: '基準値', q25: 'Q25', q75: 'Q75', volatility: 'ボラティリティ', primeSets: 'Prime セット', primeBlueprints: 'Prime 設計図', primeParts: 'Prime パーツ', primedMods: 'Primed Mod', rareMods: 'レア Mod', otherMods: 'その他の Mod', relics: 'レリック', weapons: '武器', cosmetics: '外装', arcanes: 'アルケイン', resources: '素材', archwing: 'アークウイング', companions: 'コンパニオン', necramechs: 'ネクロメカ', equipment: '装備', collectibles: 'コレクション', ayatan: 'Ayatan', utility: 'ユーティリティ', misc: 'その他', syndicate: 'シンジケート'
  },
  ko: {
    platform: '플랫폼', analysisPeriod: '분석 기간', categories: '카테고리', defaults: '기본값', selectAll: '전체', clear: '지우기', crossplay: '크로스플레이', unavailable: '사용 불가', loading: '데이터 불러오는 중…', loadError: '마켓 데이터를 불러오지 못했습니다', retry: '다시 시도', noData: '현재 필터에 맞는 아이템이 없습니다.', dataDate: '데이터', priceHistory: '가격 기록', range30d: '30일', range90d: '90일', analysisWindow: '분석 구간', baseline: '기준값', q25: 'Q25', q75: 'Q75', volatility: '변동성', primeSets: '프라임 세트', primeBlueprints: '프라임 설계도', primeParts: '프라임 부품', primedMods: '프라임드 모드', rareMods: '레어 모드', otherMods: '기타 모드', relics: '성유물', weapons: '무기', cosmetics: '외형', arcanes: '아케인', resources: '자원', archwing: '아크윙', companions: '동반자', necramechs: '네크라메크', equipment: '장비', collectibles: '수집품', ayatan: '아야탄', utility: '유틸리티', misc: '기타', syndicate: '신디케이트'
  },
  'zh-hans': {
    platform: '平台', analysisPeriod: '分析周期', categories: '分类', defaults: '默认', selectAll: '全部', clear: '清除', crossplay: '跨平台', unavailable: '不可用', loading: '正在加载数据…', loadError: '无法加载市场数据', retry: '重试', noData: '没有符合当前筛选条件的物品。', dataDate: '数据', priceHistory: '价格历史', range30d: '30天', range90d: '90天', analysisWindow: '分析窗口', baseline: '基准价', q25: 'Q25', q75: 'Q75', volatility: '波动率', primeSets: 'Prime 套装', primeBlueprints: 'Prime 蓝图', primeParts: 'Prime 部件', primedMods: 'Primed Mod', rareMods: '稀有 Mod', otherMods: '其他 Mod', relics: '遗物', weapons: '武器', cosmetics: '外观', arcanes: '赋能', resources: '资源', archwing: 'Archwing', companions: '同伴', necramechs: '殁世机甲', equipment: '装备', collectibles: '收藏品', ayatan: '阿耶檀', utility: '实用物品', misc: '其他', syndicate: '集团'
  },
  'zh-hant': {
    platform: '平台', analysisPeriod: '分析週期', categories: '分類', defaults: '預設', selectAll: '全部', clear: '清除', crossplay: '跨平台', unavailable: '不可用', loading: '正在載入資料…', loadError: '無法載入市場資料', retry: '重試', noData: '沒有符合目前篩選條件的物品。', dataDate: '資料', priceHistory: '價格歷史', range30d: '30天', range90d: '90天', analysisWindow: '分析視窗', baseline: '基準價', q25: 'Q25', q75: 'Q75', volatility: '波動率', primeSets: 'Prime 套裝', primeBlueprints: 'Prime 藍圖', primeParts: 'Prime 部件', primedMods: 'Primed Mod', rareMods: '稀有 Mod', otherMods: '其他 Mod', relics: '遺物', weapons: '武器', cosmetics: '外觀', arcanes: '賦能', resources: '資源', archwing: 'Archwing', companions: '同伴', necramechs: '亡骸機甲', equipment: '裝備', collectibles: '收藏品', ayatan: '阿耶檀', utility: '實用物品', misc: '其他', syndicate: '集團'
  }
}
