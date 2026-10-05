import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Read a saved upstream response from lib/ingest/__fixtures__. */
export const fixture = (name: string) => readFileSync(join(process.cwd(), "lib", "ingest", "__fixtures__", name), "utf8");
export const jsonFixture = <T = unknown>(name: string): T => JSON.parse(fixture(name)) as T;
