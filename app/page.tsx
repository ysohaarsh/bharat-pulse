import { Dashboard } from "@/components/feed/dashboard";
import { parseFilters } from "@/lib/events/filters";
import { loadHomeEvents } from "@/lib/events/queries";
import { loadVitals } from "@/lib/metrics/queries";

/** India situation room: vitals (left), live map (centre), filterable realtime feed (right). Filters live in the URL. */
export default async function Home({ searchParams }: PageProps<"/">) {
  const filters = parseFilters(await searchParams);
  const [{ events, error, now }, vitals] = await Promise.all([loadHomeEvents(filters), loadVitals()]);

  return <Dashboard initialEvents={events} vitals={vitals} filters={filters} serverNow={now} error={error} />;
}
