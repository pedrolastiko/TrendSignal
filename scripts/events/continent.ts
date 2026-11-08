import { isNorthAmerica } from './classify.ts';

/**
 * Where on Earth an event is held. Central America and the Caribbean count as North America;
 * Turkey, Georgia, Armenia and Azerbaijan count as Asia, Cyprus as Europe, Russia as Europe.
 * Online events have no continent.
 */
export const CONTINENTS = [
  'north-america',
  'south-america',
  'europe',
  'asia',
  'africa',
  'oceania',
] as const;
export type Continent = (typeof CONTINENTS)[number];

/** ISO 3166-1 alpha-2 codes by continent, space-separated. */
const CODES: Record<Continent, string> = {
  'north-america':
    'AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI',
  'south-america': 'AR BO BR CL CO EC FK GF GY PE PY SR UY VE',
  europe:
    'AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK',
  asia: 'AE AF AM AZ BD BH BN BT CN GE HK ID IL IN IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE',
  africa:
    'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW',
  oceania: 'AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV VU WF WS',
};

const CONTINENT_BY_CODE = new Map<string, Continent>(
  (Object.entries(CODES) as [Continent, string][]).flatMap(([continent, codes]) =>
    codes.split(' ').map((code) => [code, continent] as const),
  ),
);

export function continentOfCountryCode(code: string | undefined): Continent | undefined {
  return code ? CONTINENT_BY_CODE.get(code.trim().toUpperCase()) : undefined;
}

function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Spellings `Intl.DisplayNames` does not give for the same country. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US',
  us: 'US',
  'u s': 'US',
  'u s a': 'US',
  'united states of america': 'US',
  america: 'US',
  uk: 'GB',
  'u k': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  'great britain': 'GB',
  uae: 'AE',
  'u a e': 'AE',
  'south korea': 'KR',
  korea: 'KR',
  'republic of korea': 'KR',
  'czech republic': 'CZ',
  turkey: 'TR',
  turkiye: 'TR',
  'hong kong': 'HK',
  vietnam: 'VN',
  'viet nam': 'VN',
  'ivory coast': 'CI',
  holland: 'NL',
  'the netherlands': 'NL',
  palestine: 'PS',
  macau: 'MO',
  macao: 'MO',
  russia: 'RU',
  taiwan: 'TW',
  burma: 'MM',
  congo: 'CD',
};

let countryByName: Map<string, string> | undefined;

/** Every country name `Intl.DisplayNames` knows, folded, mapped to its ISO code. */
function countryNames(): Map<string, string> {
  if (countryByName) return countryByName;
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const map = new Map<string, string>();
  for (const code of CONTINENT_BY_CODE.keys()) {
    const name = names.of(code);
    if (name && name !== code) map.set(fold(name), code);
  }
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) map.set(alias, code);
  countryByName = map;
  return map;
}

/** Cities that carry a conference but are rarely written with their country. */
const CITY_CONTINENT: Record<Continent, string> = {
  'north-america':
    'new york|san francisco|las vegas|seattle|austin|boston|washington|chicago|denver|salt lake city|atlanta|toronto|montreal|vancouver|ottawa|calgary|edmonton|halifax|winnipeg|san diego|los angeles|dallas|houston|orlando|phoenix|portland|nashville|san jose|baltimore|tampa|detroit|minneapolis|philadelphia|miami|mexico city|guadalajara|monterrey|quebec|banff',
  'south-america':
    'sao paulo|rio de janeiro|buenos aires|santiago|bogota|lima|montevideo|quito|medellin|brasilia|curitiba|porto alegre',
  europe:
    'london|berlin|paris|amsterdam|madrid|barcelona|rome|milan|vienna|zurich|geneva|brussels|dublin|lisbon|prague|warsaw|stockholm|oslo|copenhagen|helsinki|munich|frankfurt|hamburg|cologne|dusseldorf|stuttgart|budapest|athens|bucharest|sofia|tallinn|riga|vilnius|luxembourg|edinburgh|manchester|birmingham|belfast|luxembourg|bern|basel|lausanne|moscow|saint petersburg|kyiv|kiev|belgrade|zagreb|ljubljana|bratislava|bruges|ghent|rotterdam|the hague|lyon|nice|toulouse|bordeaux|lille|nuremberg|essen|bochum|leipzig|dresden|bournemouth|sheffield|leeds|glasgow|cardiff|bristol|liverpool',
  asia: 'tokyo|osaka|seoul|singapore|hong kong|bangkok|kuala lumpur|mumbai|delhi|new delhi|bangalore|bengaluru|hyderabad|chennai|pune|kochi|kolkata|dubai|abu dhabi|riyadh|jeddah|doha|manama|muscat|kuwait city|tel aviv|jerusalem|taipei|shanghai|beijing|shenzhen|guangzhou|jakarta|bali|manila|hanoi|ho chi minh|colombo|dhaka|karachi|lahore|islamabad|istanbul|izmir|ankara|tbilisi|baku|yerevan|almaty|tashkent|kathmandu|amman|beirut',
  africa:
    'cape town|johannesburg|nairobi|lagos|abuja|accra|cairo|casablanca|rabat|kigali|tunis|addis ababa|kampala|dar es salaam|durban|pretoria|kinshasa|dakar|algiers|marrakech|lusaka|harare|windhoek|gaborone|maputo|luanda|abidjan',
  oceania:
    'sydney|melbourne|brisbane|perth|adelaide|canberra|auckland|wellington|christchurch|gold coast|hobart|darwin',
};

const CITY_TO_CONTINENT = new Map<string, Continent>(
  (Object.entries(CITY_CONTINENT) as [Continent, string][]).flatMap(([continent, cities]) =>
    cities.split('|').map((city) => [city, continent] as const),
  ),
);

/** The longest whole-word match of a known city in the text, so "new york" beats "york". */
function cityContinent(text: string): Continent | undefined {
  const padded = ` ${fold(text)} `;
  let best: { city: string; continent: Continent } | undefined;
  for (const [city, continent] of CITY_TO_CONTINENT) {
    if (padded.includes(` ${city} `) && (!best || city.length > best.city.length)) {
      best = { city, continent };
    }
  }
  return best?.continent;
}

/** A country named in a location ("Toronto, ON, Canada"), looking from the end, where it usually is. */
function countryContinent(location: string): Continent | undefined {
  const names = countryNames();
  const parts = location
    .split(/[,|–—/]|\s-\s/)
    .map(fold)
    .filter(Boolean)
    .reverse();
  for (const part of parts) {
    const code = names.get(part);
    if (code) return continentOfCountryCode(code);
  }
  return undefined;
}

export interface ContinentInput {
  /** Explicit ISO alpha-2 country, when the publisher states one. */
  countryCode?: string;
  location?: string;
  title?: string;
  /** Where the source's in-person events are, when nothing else says. */
  sourceRegion?: 'north-america' | 'global';
}

/**
 * The continent of an in-person or hybrid event, or undefined when it cannot be told. In order:
 * an explicit country; a country named in the location; a known city or a US state / Canadian
 * province in the location; a known city in the title; the source's own region.
 */
export function resolveContinent({
  countryCode,
  location,
  title,
  sourceRegion,
}: ContinentInput): Continent | undefined {
  const fromCode = continentOfCountryCode(countryCode);
  if (fromCode) return fromCode;

  if (location) {
    const named = countryContinent(location);
    if (named) return named;
    const city = cityContinent(location);
    if (city) return city;
    if (isNorthAmerica('', undefined, location)) return 'north-america';
  }
  if (title) {
    const city = cityContinent(title);
    if (city) return city;
  }
  return sourceRegion === 'north-america' ? 'north-america' : undefined;
}
