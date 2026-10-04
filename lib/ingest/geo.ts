/**
 * Tiny offline geocoder for news text: finds the country a headline is most likely
 * about and returns its capital-city coordinates. Good enough to put a pin on a map.
 *
 * Matching rules
 * - Case-insensitive, letter-boundary matching (so "Ukraine's" and "U.S.-backed" match,
 *   but "India" does not match inside "Indiana").
 * - Longest alias wins at a given position ("Papua New Guinea" before "Guinea",
 *   "South Sudan" before "Sudan", "New Mexico" before "Mexico").
 * - Country with the most mentions wins; ties go to the earliest mention.
 *
 * Judgement calls on ambiguity
 * - "Georgia" (bare) is NOT an alias: US-outlet coverage of the US state dominates.
 *   The country is matched via "Tbilisi" / "Republic of Georgia" only.
 * - "Chad" (bare) is NOT an alias (common first name); "Chadian" / "N'Djamena" are.
 * - "Korea"/"Korean" alone are NOT aliases; only North/South-qualified forms and capitals.
 * - "Turkey" (the bird) and "Jordan" (the name) are accepted false-positive risks.
 * - Short acronyms ("US", "UK", "UAE", "DRC") match only in exact uppercase, so the
 *   pronoun "us" never hits.
 * - Some phrases are "sinks" that consume text without yielding a country
 *   ("Latin America", "New Mexico", "Indian Ocean", ...).
 */

export interface GeoMatch {
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lng: number;
}

interface CountryEntry {
  code: string;
  lat: number;
  lng: number;
  /** First entry is the canonical English name. */
  names: string[];
  /** Exact-case acronyms. */
  acronyms?: string[];
}

// Coordinates are capital cities (rounded), which is where most national news is pinned.
const COUNTRIES: CountryEntry[] = [
  { code: "AF", lat: 34.53, lng: 69.17, names: ["Afghanistan", "Afghan", "Afghans", "Kabul", "Taliban"] },
  { code: "AL", lat: 41.33, lng: 19.82, names: ["Albania", "Albanian", "Tirana"] },
  { code: "DZ", lat: 36.75, lng: 3.06, names: ["Algeria", "Algerian", "Algiers"] },
  { code: "AO", lat: -8.84, lng: 13.23, names: ["Angola", "Angolan", "Luanda"] },
  { code: "AR", lat: -34.6, lng: -58.38, names: ["Argentina", "Argentine", "Argentinian", "Buenos Aires"] },
  { code: "AM", lat: 40.18, lng: 44.51, names: ["Armenia", "Armenian", "Yerevan"] },
  { code: "AU", lat: -35.28, lng: 149.13, names: ["Australia", "Australian", "Australians", "Canberra", "Sydney", "Melbourne"] },
  { code: "AT", lat: 48.21, lng: 16.37, names: ["Austria", "Austrian", "Vienna"] },
  { code: "AZ", lat: 40.41, lng: 49.87, names: ["Azerbaijan", "Azerbaijani", "Baku"] },
  { code: "BH", lat: 26.23, lng: 50.59, names: ["Bahrain", "Bahraini", "Manama"] },
  { code: "BD", lat: 23.81, lng: 90.41, names: ["Bangladesh", "Bangladeshi", "Dhaka"] },
  { code: "BY", lat: 53.9, lng: 27.56, names: ["Belarus", "Belarusian", "Minsk"] },
  { code: "BE", lat: 50.85, lng: 4.35, names: ["Belgium", "Belgian", "Brussels"] },
  { code: "BO", lat: -16.5, lng: -68.15, names: ["Bolivia", "Bolivian", "La Paz"] },
  { code: "BA", lat: 43.86, lng: 18.41, names: ["Bosnia", "Bosnian", "Sarajevo"] },
  { code: "BR", lat: -15.79, lng: -47.88, names: ["Brazil", "Brazilian", "Brazilians", "Brasilia", "Brasília", "Rio de Janeiro", "Sao Paulo", "São Paulo"] },
  { code: "BG", lat: 42.7, lng: 23.32, names: ["Bulgaria", "Bulgarian", "Sofia"] },
  { code: "BF", lat: 12.37, lng: -1.52, names: ["Burkina Faso", "Ouagadougou"] },
  { code: "KH", lat: 11.56, lng: 104.92, names: ["Cambodia", "Cambodian", "Phnom Penh"] },
  { code: "CM", lat: 3.87, lng: 11.52, names: ["Cameroon", "Cameroonian", "Yaounde", "Yaoundé"] },
  { code: "CA", lat: 45.42, lng: -75.7, names: ["Canada", "Canadian", "Canadians", "Ottawa", "Toronto"] },
  { code: "CF", lat: 4.39, lng: 18.56, names: ["Central African Republic", "Bangui"] },
  { code: "TD", lat: 12.13, lng: 15.06, names: ["Chadian", "N'Djamena", "Republic of Chad"] },
  { code: "CL", lat: -33.45, lng: -70.67, names: ["Chile", "Chilean", "Santiago"] },
  { code: "CN", lat: 39.9, lng: 116.41, names: ["China", "Chinese", "Beijing", "Shanghai"] },
  { code: "CO", lat: 4.71, lng: -74.07, names: ["Colombia", "Colombian", "Bogota", "Bogotá"] },
  { code: "CD", lat: -4.44, lng: 15.27, names: ["Democratic Republic of the Congo", "Democratic Republic of Congo", "Congolese", "Congo", "Kinshasa", "Goma"], acronyms: ["DRC", "DR Congo"] },
  { code: "CG", lat: -4.27, lng: 15.28, names: ["Republic of the Congo", "Congo-Brazzaville", "Brazzaville"] },
  { code: "CR", lat: 9.93, lng: -84.08, names: ["Costa Rica", "Costa Rican"] },
  { code: "HR", lat: 45.81, lng: 15.98, names: ["Croatia", "Croatian", "Zagreb"] },
  { code: "CU", lat: 23.11, lng: -82.37, names: ["Cuba", "Cuban", "Havana"] },
  { code: "CY", lat: 35.19, lng: 33.38, names: ["Cyprus", "Cypriot", "Nicosia"] },
  { code: "CZ", lat: 50.08, lng: 14.44, names: ["Czech Republic", "Czechia", "Czech", "Prague"] },
  { code: "DK", lat: 55.68, lng: 12.57, names: ["Denmark", "Danish", "Copenhagen"] },
  { code: "DO", lat: 18.49, lng: -69.93, names: ["Dominican Republic", "Santo Domingo"] },
  { code: "EC", lat: -0.18, lng: -78.47, names: ["Ecuador", "Ecuadorian", "Quito"] },
  { code: "EG", lat: 30.04, lng: 31.24, names: ["Egypt", "Egyptian", "Egyptians", "Cairo"] },
  { code: "SV", lat: 13.69, lng: -89.22, names: ["El Salvador", "Salvadoran", "San Salvador"] },
  { code: "ER", lat: 15.32, lng: 38.93, names: ["Eritrea", "Eritrean", "Asmara"] },
  { code: "EE", lat: 59.44, lng: 24.75, names: ["Estonia", "Estonian", "Tallinn"] },
  { code: "ET", lat: 9.03, lng: 38.74, names: ["Ethiopia", "Ethiopian", "Addis Ababa", "Tigray", "Mekelle", "Amhara"] },
  { code: "FI", lat: 60.17, lng: 24.94, names: ["Finland", "Finnish", "Helsinki"] },
  { code: "FR", lat: 48.86, lng: 2.35, names: ["France", "French", "Paris", "Macron"] },
  { code: "GE", lat: 41.72, lng: 44.79, names: ["Republic of Georgia", "Tbilisi"] },
  { code: "DE", lat: 52.52, lng: 13.4, names: ["Germany", "German", "Germans", "Berlin"] },
  { code: "GH", lat: 5.6, lng: -0.19, names: ["Ghana", "Ghanaian", "Accra"] },
  { code: "GR", lat: 37.98, lng: 23.73, names: ["Greece", "Greek", "Athens"] },
  { code: "GT", lat: 14.63, lng: -90.51, names: ["Guatemala", "Guatemalan", "Guatemala City"] },
  { code: "GN", lat: 9.64, lng: -13.58, names: ["Guinea", "Guinean", "Conakry"] },
  { code: "HT", lat: 18.59, lng: -72.31, names: ["Haiti", "Haitian", "Haitians", "Port-au-Prince"] },
  { code: "HN", lat: 14.07, lng: -87.19, names: ["Honduras", "Honduran", "Tegucigalpa"] },
  { code: "HK", lat: 22.32, lng: 114.17, names: ["Hong Kong"] },
  { code: "HU", lat: 47.5, lng: 19.04, names: ["Hungary", "Hungarian", "Budapest"] },
  { code: "IS", lat: 64.15, lng: -21.94, names: ["Iceland", "Icelandic", "Reykjavik"] },
  { code: "IN", lat: 28.61, lng: 77.21, names: ["India", "Indian", "Indians", "New Delhi", "Delhi", "Mumbai", "Kashmir"] },
  { code: "ID", lat: -6.21, lng: 106.85, names: ["Indonesia", "Indonesian", "Jakarta", "Bali"] },
  { code: "IR", lat: 35.69, lng: 51.39, names: ["Iran", "Iranian", "Iranians", "Tehran"] },
  { code: "IQ", lat: 33.31, lng: 44.36, names: ["Iraq", "Iraqi", "Iraqis", "Baghdad"] },
  { code: "IE", lat: 53.35, lng: -6.26, names: ["Ireland", "Irish", "Dublin"] },
  { code: "IL", lat: 31.77, lng: 35.21, names: ["Israel", "Israeli", "Israelis", "Jerusalem", "Tel Aviv", "Netanyahu"], acronyms: ["IDF"] },
  { code: "IT", lat: 41.9, lng: 12.5, names: ["Italy", "Italian", "Italians", "Rome", "Milan"] },
  { code: "JM", lat: 18.0, lng: -76.79, names: ["Jamaica", "Jamaican", "Kingston"] },
  { code: "JP", lat: 35.68, lng: 139.69, names: ["Japan", "Japanese", "Tokyo"] },
  { code: "JO", lat: 31.95, lng: 35.93, names: ["Jordan", "Jordanian", "Amman"] },
  { code: "KZ", lat: 51.17, lng: 71.45, names: ["Kazakhstan", "Kazakh", "Astana", "Almaty"] },
  { code: "KE", lat: -1.29, lng: 36.82, names: ["Kenya", "Kenyan", "Kenyans", "Nairobi"] },
  { code: "KP", lat: 39.04, lng: 125.76, names: ["North Korea", "North Korean", "Pyongyang", "Kim Jong Un"] },
  { code: "KR", lat: 37.57, lng: 126.98, names: ["South Korea", "South Korean", "Seoul"] },
  { code: "XK", lat: 42.66, lng: 21.17, names: ["Kosovo", "Pristina"] },
  { code: "KW", lat: 29.38, lng: 47.99, names: ["Kuwait", "Kuwaiti"] },
  { code: "KG", lat: 42.87, lng: 74.59, names: ["Kyrgyzstan", "Kyrgyz", "Bishkek"] },
  { code: "LA", lat: 17.98, lng: 102.63, names: ["Laos", "Laotian", "Vientiane"] },
  { code: "LV", lat: 56.95, lng: 24.11, names: ["Latvia", "Latvian", "Riga"] },
  { code: "LB", lat: 33.89, lng: 35.5, names: ["Lebanon", "Lebanese", "Beirut", "Hezbollah"] },
  { code: "LY", lat: 32.89, lng: 13.19, names: ["Libya", "Libyan", "Libyans", "Tripoli", "Benghazi"] },
  { code: "LT", lat: 54.69, lng: 25.28, names: ["Lithuania", "Lithuanian", "Vilnius"] },
  { code: "MG", lat: -18.88, lng: 47.51, names: ["Madagascar", "Malagasy", "Antananarivo"] },
  { code: "MW", lat: -13.96, lng: 33.79, names: ["Malawi", "Malawian", "Lilongwe"] },
  { code: "MY", lat: 3.14, lng: 101.69, names: ["Malaysia", "Malaysian", "Kuala Lumpur"] },
  { code: "ML", lat: 12.64, lng: -8.0, names: ["Mali", "Malian", "Bamako"] },
  { code: "MX", lat: 19.43, lng: -99.13, names: ["Mexico", "Mexican", "Mexicans", "Mexico City"] },
  { code: "MD", lat: 47.01, lng: 28.86, names: ["Moldova", "Moldovan", "Chisinau"] },
  { code: "MN", lat: 47.89, lng: 106.91, names: ["Mongolia", "Mongolian", "Ulaanbaatar"] },
  { code: "MA", lat: 34.02, lng: -6.84, names: ["Morocco", "Moroccan", "Rabat"] },
  { code: "MZ", lat: -25.97, lng: 32.57, names: ["Mozambique", "Mozambican", "Maputo"] },
  { code: "MM", lat: 19.76, lng: 96.08, names: ["Myanmar", "Burma", "Burmese", "Naypyidaw", "Yangon"] },
  { code: "NP", lat: 27.72, lng: 85.32, names: ["Nepal", "Nepalese", "Nepali", "Kathmandu"] },
  { code: "NL", lat: 52.37, lng: 4.9, names: ["Netherlands", "Dutch", "Amsterdam", "The Hague"] },
  { code: "NZ", lat: -41.29, lng: 174.78, names: ["New Zealand", "Wellington", "Auckland"] },
  { code: "NI", lat: 12.11, lng: -86.24, names: ["Nicaragua", "Nicaraguan", "Managua"] },
  { code: "NE", lat: 13.51, lng: 2.11, names: ["Niger", "Nigerien", "Niamey"] },
  { code: "NG", lat: 9.08, lng: 7.4, names: ["Nigeria", "Nigerian", "Nigerians", "Abuja", "Lagos"] },
  { code: "NO", lat: 59.91, lng: 10.75, names: ["Norway", "Norwegian", "Oslo"] },
  { code: "OM", lat: 23.59, lng: 58.41, names: ["Oman", "Omani", "Muscat"] },
  { code: "PK", lat: 33.68, lng: 73.05, names: ["Pakistan", "Pakistani", "Pakistanis", "Islamabad", "Karachi", "Lahore"] },
  { code: "PS", lat: 31.5, lng: 34.47, names: ["Palestine", "Palestinian", "Palestinians", "Gaza", "West Bank", "Hamas", "Ramallah"] },
  { code: "PA", lat: 8.98, lng: -79.52, names: ["Panama", "Panamanian"] },
  { code: "PG", lat: -9.44, lng: 147.18, names: ["Papua New Guinea", "Port Moresby"] },
  { code: "PY", lat: -25.26, lng: -57.58, names: ["Paraguay", "Paraguayan", "Asuncion"] },
  { code: "PE", lat: -12.05, lng: -77.04, names: ["Peru", "Peruvian", "Lima"] },
  { code: "PH", lat: 14.6, lng: 120.98, names: ["Philippines", "Philippine", "Filipino", "Filipinos", "Manila"] },
  { code: "PL", lat: 52.23, lng: 21.01, names: ["Poland", "Polish", "Warsaw"] },
  { code: "PT", lat: 38.72, lng: -9.14, names: ["Portugal", "Portuguese", "Lisbon"] },
  { code: "QA", lat: 25.29, lng: 51.53, names: ["Qatar", "Qatari", "Doha"] },
  { code: "RO", lat: 44.43, lng: 26.1, names: ["Romania", "Romanian", "Bucharest"] },
  { code: "RU", lat: 55.76, lng: 37.62, names: ["Russia", "Russian", "Russians", "Moscow", "Kremlin", "Putin"] },
  { code: "RW", lat: -1.94, lng: 30.06, names: ["Rwanda", "Rwandan", "Kigali"] },
  { code: "SA", lat: 24.71, lng: 46.68, names: ["Saudi Arabia", "Saudi", "Saudis", "Riyadh"] },
  { code: "SN", lat: 14.72, lng: -17.47, names: ["Senegal", "Senegalese", "Dakar"] },
  { code: "RS", lat: 44.79, lng: 20.45, names: ["Serbia", "Serbian", "Belgrade"] },
  { code: "SL", lat: 8.48, lng: -13.23, names: ["Sierra Leone", "Freetown"] },
  { code: "SG", lat: 1.35, lng: 103.82, names: ["Singapore", "Singaporean"] },
  { code: "SK", lat: 48.15, lng: 17.11, names: ["Slovakia", "Slovak", "Bratislava"] },
  { code: "SI", lat: 46.06, lng: 14.51, names: ["Slovenia", "Slovenian", "Ljubljana"] },
  { code: "SO", lat: 2.05, lng: 45.32, names: ["Somalia", "Somali", "Mogadishu", "al-Shabab", "al-Shabaab"] },
  { code: "ZA", lat: -25.75, lng: 28.19, names: ["South Africa", "South African", "Pretoria", "Johannesburg", "Cape Town"] },
  { code: "SS", lat: 4.85, lng: 31.58, names: ["South Sudan", "South Sudanese", "Juba"] },
  { code: "ES", lat: 40.42, lng: -3.7, names: ["Spain", "Spanish", "Madrid", "Barcelona"] },
  { code: "LK", lat: 6.93, lng: 79.86, names: ["Sri Lanka", "Sri Lankan", "Colombo"] },
  { code: "SD", lat: 15.5, lng: 32.56, names: ["Sudan", "Sudanese", "Khartoum", "Darfur", "El Fasher"] },
  { code: "SE", lat: 59.33, lng: 18.07, names: ["Sweden", "Swedish", "Stockholm"] },
  { code: "CH", lat: 46.95, lng: 7.45, names: ["Switzerland", "Swiss", "Bern", "Geneva", "Zurich"] },
  { code: "SY", lat: 33.51, lng: 36.29, names: ["Syria", "Syrian", "Syrians", "Damascus", "Aleppo"] },
  { code: "TW", lat: 25.03, lng: 121.57, names: ["Taiwan", "Taiwanese", "Taipei"] },
  { code: "TJ", lat: 38.56, lng: 68.79, names: ["Tajikistan", "Tajik", "Dushanbe"] },
  { code: "TZ", lat: -6.79, lng: 39.21, names: ["Tanzania", "Tanzanian", "Dodoma", "Dar es Salaam"] },
  { code: "TH", lat: 13.76, lng: 100.5, names: ["Thailand", "Thai", "Bangkok"] },
  { code: "TN", lat: 36.81, lng: 10.18, names: ["Tunisia", "Tunisian", "Tunis"] },
  { code: "TR", lat: 39.93, lng: 32.86, names: ["Turkey", "Türkiye", "Turkiye", "Turkish", "Ankara", "Istanbul", "Erdogan"] },
  { code: "TM", lat: 37.96, lng: 58.33, names: ["Turkmenistan", "Turkmen", "Ashgabat"] },
  { code: "UG", lat: 0.35, lng: 32.58, names: ["Uganda", "Ugandan", "Kampala"] },
  { code: "UA", lat: 50.45, lng: 30.52, names: ["Ukraine", "Ukrainian", "Ukrainians", "Kyiv", "Kiev", "Kharkiv", "Odesa", "Odessa", "Zelensky", "Zelenskyy", "Donbas"] },
  { code: "AE", lat: 24.45, lng: 54.38, names: ["United Arab Emirates", "Emirati", "Abu Dhabi", "Dubai"], acronyms: ["UAE"] },
  { code: "GB", lat: 51.51, lng: -0.13, names: ["United Kingdom", "Britain", "British", "England", "Scotland", "Wales", "London", "Downing Street"], acronyms: ["UK", "U.K."] },
  { code: "US", lat: 38.9, lng: -77.04, names: ["United States", "America", "American", "Americans", "Washington", "White House", "Pentagon", "New York"], acronyms: ["US", "U.S.", "USA", "U.S.A."] },
  { code: "UY", lat: -34.9, lng: -56.19, names: ["Uruguay", "Uruguayan", "Montevideo"] },
  { code: "UZ", lat: 41.3, lng: 69.24, names: ["Uzbekistan", "Uzbek", "Tashkent"] },
  { code: "VE", lat: 10.48, lng: -66.9, names: ["Venezuela", "Venezuelan", "Venezuelans", "Caracas", "Maduro"] },
  { code: "VN", lat: 21.03, lng: 105.85, names: ["Vietnam", "Viet Nam", "Vietnamese", "Hanoi"] },
  { code: "YE", lat: 15.37, lng: 44.19, names: ["Yemen", "Yemeni", "Sanaa", "Houthi", "Houthis"] },
  { code: "ZM", lat: -15.39, lng: 28.32, names: ["Zambia", "Zambian", "Lusaka"] },
  { code: "ZW", lat: -17.83, lng: 31.05, names: ["Zimbabwe", "Zimbabwean", "Harare"] },
];

/** Phrases that would otherwise trigger a wrong country; matched and discarded. */
const SINKS = [
  "Latin America",
  "Latin American",
  "South America",
  "South American",
  "North America",
  "North American",
  "Central America",
  "Central American",
  "Native American",
  "Native Americans",
  "Indian Ocean",
  "New Mexico",
  "New South Wales",
  "Gulf of Mexico",
  "French Guiana",
  "Equatorial Guinea",
  "Guinea-Bissau",
  "New England",
  "Georgia",
];

type AliasTarget = { entry: CountryEntry | null; exact: string | null };

const ALIASES = new Map<string, AliasTarget>();
for (const s of SINKS) ALIASES.set(s.toLowerCase(), { entry: null, exact: null });
for (const entry of COUNTRIES) {
  for (const n of entry.names) ALIASES.set(n.toLowerCase(), { entry, exact: null });
  for (const a of entry.acronyms ?? []) ALIASES.set(a.toLowerCase(), { entry, exact: a });
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Longest-first alternation so the regex engine prefers "South Sudan" over "Sudan".
const PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${[...ALIASES.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

const toMatch = (c: CountryEntry): GeoMatch => ({ country: c.code, lat: c.lat, lng: c.lng });

/** Best-guess country mentioned in free text, or null. */
export function detectCountry(text: string | null | undefined): GeoMatch | null {
  if (!text) return null;
  const tally = new Map<CountryEntry, { count: number; first: number }>();
  for (const m of text.matchAll(PATTERN)) {
    const target = ALIASES.get(m[0].toLowerCase());
    if (!target?.entry) continue;
    if (target.exact !== null && m[0] !== target.exact) continue;
    const t = tally.get(target.entry);
    if (t) t.count++;
    else tally.set(target.entry, { count: 1, first: m.index });
  }
  let best: [CountryEntry, { count: number; first: number }] | null = null;
  for (const e of tally) {
    if (!best || e[1].count > best[1].count || (e[1].count === best[1].count && e[1].first < best[1].first)) {
      best = e;
    }
  }
  return best ? toMatch(best[0]) : null;
}

/** Look up a country by ISO alpha-2 code. */
export function countryByCode(code: string | null | undefined): GeoMatch | null {
  const c = code ? BY_CODE.get(code.toUpperCase()) : undefined;
  return c ? toMatch(c) : null;
}

/** Canonical English name from our table (first alias), e.g. "PS" → "Palestine". */
export function countryDisplayName(code: string | null | undefined): string | null {
  const c = code ? BY_CODE.get(code.toUpperCase()) : undefined;
  return c ? c.names[0] : null;
}

/** Look up a country by an exact name/alias (case-insensitive), e.g. GDELT's `sourcecountry`. */
export function countryByName(name: string | null | undefined): GeoMatch | null {
  if (!name) return null;
  const target = ALIASES.get(name.trim().toLowerCase());
  if (target?.entry) return toMatch(target.entry);
  return detectCountry(name);
}

export const COUNTRY_COUNT = COUNTRIES.length;
