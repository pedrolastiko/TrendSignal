export interface TranslationDictionary {
  app: { name: string; tagline: string };
  nav: { dashboard: string; trends: string; events: string; keywords: string; sources: string };
  dashboard: {
    title: string;
    subtitle: string;
    refresh: string;
    refreshHint: string;
    kpiArticles: string;
    kpiKeywords: string;
    kpiSources: string;
    kpiLastScan: string;
    searchPlaceholder: string;
    topTrends: string;
    filters: {
      keyword: string;
      source: string;
      category: string;
      date: string;
      all: string;
      sortBy: string;
      sortNewest: string;
      sortRelevance: string;
      sortTrend: string;
    };
    states: { loading: string; empty: string; error: string; stale: string };
    view: { label: string; grid: string; compact: string };
  };
  whatsNew: {
    summaryOne: string;
    summaryOther: string;
    showNew: string;
    showAll: string;
    markSeen: string;
    badge: string;
  };
  preferences: {
    title: string;
    theme: { label: string; system: string; light: string; dark: string };
    language: { label: string; en: string; fr: string };
  };
  shortcuts: {
    open: string;
    title: string;
    description: string;
    enabled: string;
    enabledHint: string;
    focusSearch: string;
    nextArticle: string;
    previousArticle: string;
    openArticle: string;
    goDashboard: string;
    goTrends: string;
    goEvents: string;
    goKeywords: string;
    goSources: string;
    help: string;
    then: string;
  };
  article: {
    relevance: string;
    readMore: string;
    imageAlt: string;
    placeholderAlt: string;
    logoAlt: string;
    matchedKeywords: string;
    publisherTags: string;
    upcoming: string;
  };
  trends: {
    title: string;
    subtitle: string;
    timeframe24h: string;
    timeframe7d: string;
    timeframe30d: string;
    score: string;
    volume: string;
    growth: string;
    sourceCount: string;
    leadingSources: string;
    relatedArticles: string;
    status: {
      breakout: string;
      emerging: string;
      rising: string;
      stable: string;
      declining: string;
    };
  };
  events: {
    title: string;
    subtitle: string;
    countOne: string;
    countOther: string;
    filters: {
      kind: string;
      kindAll: string;
      kindWebinar: string;
      kindConference: string;
      format: string;
      formatAll: string;
      period: string;
      period7d: string;
      period30d: string;
      period90d: string;
      periodAll: string;
      dateStatus: string;
      dateStatusAll: string;
      dateStatusConfirmed: string;
    };
    dateStatus: { estimated: string };
    estimatedFrom: string;
    estimatedReported: string;
    kind: { webinar: string; conference: string; event: string };
    format: { online: string; 'in-person': string; hybrid: string };
    viewEvent: string;
    addToCalendar: string;
    states: { unavailable: string; empty: string };
    sources: { title: string; lastSuccess: string; events: string };
    widget: { title: string; viewAll: string };
  };
  keywords: {
    title: string;
    subtitle: string;
    add: string;
    labelFr: string;
    labelEn: string;
    category: string;
    synonyms: string;
    lastDetection: string;
    articleCount: string;
    enabled: string;
    disabled: string;
    hideLocally: string;
    showLocally: string;
    localPreferenceNote: string;
  };
  sources: {
    title: string;
    subtitle: string;
    add: string;
    company: string;
    category: string;
    homepage: string;
    collectionMethod: string;
    lastAttempt: string;
    lastSuccess: string;
    itemCount: string;
    consecutiveFailures: string;
    health: string;
    healthStatus: { healthy: string; warning: string; error: string; disabled: string };
    hideLocally: string;
    showLocally: string;
  };
  common: {
    close: string;
    reset: string;
    loading: string;
    menu: string;
    externalLink: string;
    skipToContent: string;
  };
  notifications: {
    enable: string;
    enabled: string;
    disable: string;
    unsupported: string;
    denied: string;
    hint: string;
  };
  update: {
    available: string;
    reload: string;
    dismiss: string;
    offlineReady: string;
  };
  attribution: string;
}
