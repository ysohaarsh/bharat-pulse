/**
 * Outbound links for an elected representative. We deliberately link out rather than copy:
 * ADR (MyNeta) declined bulk-scraping permission to a similar project, PRS and eSAKSHI publish
 * their own dashboards.
 */

/** PRS MP Track slug: lowercase, ASCII letters/digits, hyphen-separated ("Bansuri Swaraj" → "bansuri-swaraj"). */
export function prsSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(?:shri|smt|dr|adv|prof)\.?\s+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const mynetaSearch = (query: string) => `https://www.myneta.info/search_myneta.php?q=${encodeURIComponent(query)}`;
export const prsMpTrack = (name: string) => `https://prsindia.org/mptrack/18th-lok-sabha/${prsSlug(name)}`;
export const ESAKSHI_DASHBOARD = "https://mplads.mospi.gov.in/digigov/dashboard.html";
