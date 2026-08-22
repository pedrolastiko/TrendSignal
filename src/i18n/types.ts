export interface TranslationDictionary {
  app: { name: string; tagline: string };
  nav: { dashboard: string; trends: string; keywords: string; sources: string };
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
  };
  article: {
    relevance: string;
    readMore: string;
    imageAlt: string;
    placeholderAlt: string;
    matchedKeywords: string;
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
  common: { close: string; reset: string; loading: string; menu: string; externalLink: string };
  attribution: string;
}
