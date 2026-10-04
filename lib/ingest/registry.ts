import type { Source } from "@/lib/types";
import type { Ingester } from "./types";
import { usgsIngester } from "./usgs";
import { eonetIngester } from "./eonet";
import { gdeltIngester } from "./gdelt";
import { rssIngester } from "./rss";
import { gdacsIngester } from "./gdacs";
import { whoIngester } from "./who";
import { sportsIngester } from "./sports";

export const INGESTERS: Record<Source, Ingester> = {
  usgs: usgsIngester,
  eonet: eonetIngester,
  gdelt: gdeltIngester,
  rss: rssIngester,
  gdacs: gdacsIngester,
  who: whoIngester,
  sports: sportsIngester,
};
