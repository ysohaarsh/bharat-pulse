import type { Source } from "@/lib/types";
import { aqiIngester } from "./aqi";
import { firmsIngester } from "./firms";
import { ncsIngester } from "./ncs";
import { newsIngester } from "./news";
import { pibIngester } from "./pib";
import { sachetIngester } from "./sachet";
import { sportsIngester } from "./sports";
import type { Ingester } from "./types";

export const INGESTERS: Record<Source, Ingester> = {
  sachet: sachetIngester,
  ncs: ncsIngester,
  firms: firmsIngester as Ingester,
  aqi: aqiIngester as Ingester,
  pib: pibIngester as Ingester,
  news: newsIngester as Ingester,
  sports: sportsIngester as Ingester,
};
