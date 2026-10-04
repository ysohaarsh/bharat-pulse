import { Dashboard } from "@/components/feed/dashboard";
import { parseFilters } from "@/lib/events/filters";
import { loadHomeEvents } from "@/lib/events/queries";

/** Situation room: live map (left) + filterable realtime feed (right). Filters live in the URL. */
export default async function Home({ searchParams }: PageProps<"/">) {
  const filters = parseFilters(await searchParams);
  const { events, error, now } = await loadHomeEvents(filters);

  return <Dashboard initialEvents={events} filters={filters} serverNow={now} error={error} />;
}
