// Applies every migration to an in-memory Postgres + PostGIS (PGlite, no Docker) with Supabase
// stubs (roles, auth.uid(), storage, vault, cron, net), loads the real boundaries and checks:
// whois lookups (incl. Bengaluru wards), location/alert triggers, report RLS + column grants + daily cap, anon access.
//
//   npm run geo:build   # once, creates data/processed/*.geojson
//   npm run db:check
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";

const APP = process.cwd();
const db = new PGlite({ extensions: { postgis } });
const ok = (msg) => console.log("✓", msg);
const fail = (msg) => {
  console.log("✗", msg);
  process.exitCode = 1;
};
const check = (cond, good, bad) => (cond ? ok(good) : fail(bad));
const q = async (sql, params) => (await db.query(sql, params)).rows;

// ---------- Supabase stubs ----------
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema extensions; grant usage on schema extensions to anon, authenticated, service_role;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
create schema storage; grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id serial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
create publication supabase_realtime;
create schema vault; create view vault.decrypted_secrets as select 'x'::text as name, 'y'::text as decrypted_secret;
create schema cron; create function cron.schedule(name text, sched text, cmd text) returns bigint language sql as $$ select 1::bigint $$; create function cron.unschedule(name text) returns boolean language sql as $$ select true $$;
create schema net; create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int) returns bigint language sql as $$ select 1::bigint $$;
`);

// ---------- Migrations ----------
const dir = path.join(APP, "supabase/migrations");
for (const f of readdirSync(dir).sort()) {
  let sql = readFileSync(path.join(dir, f), "utf8");
  // Extensions provided by the stubs above.
  sql = sql.replace(/create extension if not exists (pg_cron|pg_net);/g, "");
  try {
    await db.exec(sql);
    ok(`migration ${f}`);
  } catch (e) {
    fail(`migration ${f}: ${e.message}`);
    process.exit(1);
  }
}

// ---------- Boundaries ----------
for (const [kind, file, batch] of [["state", "states", 4], ["district", "districts", 40], ["pc", "pc", 40], ["ac", "ac", 150], ["ward", "wards", 150]]) {
  const { features } = JSON.parse(readFileSync(path.join(APP, "data/processed", `${file}.geojson`), "utf8"));
  let n = 0;
  for (let i = 0; i < features.length; i += batch) {
    const rows = features.slice(i, i + batch).map((f) => {
      const { code, name, name_hi = null, state_code = null, ...meta } = f.properties;
      return { kind, code, name, name_hi, state_code: kind === "state" ? code : state_code, meta, geometry: JSON.stringify(f.geometry) };
    });
    n += (await q("select public.load_boundaries($1::jsonb) as n", [JSON.stringify(rows)]))[0].n;
  }
  ok(`loaded ${n} ${kind} boundaries`);
}
console.log(await q("select kind, count(*)::int from boundaries group by kind order by kind"));

// Representatives from the real sansad fixture (sitting MPs only), joined like the job does.
await db.exec(`insert into representatives (house, boundary_code, constituency, state_code, name, party_short, source, external_id)
  values ('ls', 'PC:S10_25', 'Bangalore Central', 'IN-KA', 'P C Mohan', 'BJP', 'sansad.in', '4413'),
         ('ls', (select code from boundaries where kind='pc' and name='New Delhi'), 'New Delhi', 'IN-DL', 'Bansuri Swaraj', 'BJP', 'sansad.in', '1')`);

// ---------- whois ----------
const cases = [
  ["Bengaluru MG Road", 12.9756, 77.6066, "IN-KA", "Bangalore Central"],
  ["Connaught Place", 28.6315, 77.2167, "IN-DL", "New Delhi"],
  ["Mumbai CST", 18.9398, 72.8355, "IN-MH", "Mumbai South"],
  ["Hyderabad Charminar", 17.3616, 78.4747, "IN-TS", "Hyderabad"],
  ["Srinagar", 34.0837, 74.7973, "IN-JK", "Srinagar"],
  ["Guwahati", 26.1445, 91.7362, "IN-AS", "Gauhati"],
  ["Arabian Sea", 15.0, 65.0, null, null],
];
for (const [label, lat, lng, state, pc] of cases) {
  const w = (await q("select public.whois($1, $2) as w", [lat, lng]))[0].w;
  const b = Object.fromEntries(w.boundaries.map((x) => [x.kind, x]));
  const got = [b.state?.code ?? null, b.pc?.name ?? null];
  const mp = w.representatives.find((r) => r.house === "ls")?.name;
  if (got[0] === state && got[1] === pc) ok(`whois ${label}: ${got.join(" / ")} · AC ${b.ac?.name ?? "-"} · district ${b.district?.name ?? "-"}${mp ? ` · MP ${mp}` : ""}`);
  else fail(`whois ${label}: expected ${state}/${pc}, got ${got.join("/")}`);
}

// Bengaluru GBA wards (pilot): a central point resolves to exactly one ward, which sits in the
// same assembly seat the ward file names; Delhi has no ward.
{
  const wardOf = async (lat, lng) =>
    (await q("select public.whois($1, $2) as w", [lat, lng]))[0].w.boundaries.filter((x) => x.kind === "ward");
  const mg = await wardOf(12.9756, 77.6066);
  const acMg = (await q("select public.whois($1, $2) as w", [12.9756, 77.6066]))[0].w.boundaries.find((x) => x.kind === "ac");
  check(
    mg.length === 1 && mg[0].state_code === "IN-KA" && mg[0].meta.district === "Bengaluru Urban" && mg[0].meta.number > 0,
    `whois Bengaluru MG Road ward: ${mg[0]?.code} ${mg[0]?.name} (${mg[0]?.meta.corporation}, AC ${mg[0]?.meta.ac_name}; whois AC ${acMg?.name})`,
    `whois Bengaluru MG Road ward: ${JSON.stringify(mg)}`,
  );
  const dl = await wardOf(28.6315, 77.2167);
  check(dl.length === 0, "whois Connaught Place: no ward (wards are Bengaluru-only)", `Connaught Place ward: ${JSON.stringify(dl)}`);
  const outside = await q(`select count(*)::int as n from boundaries w
    where w.kind = 'ward' and not exists (select 1 from boundaries s where s.kind = 'state' and s.code = 'IN-KA'
      and extensions.st_intersects(s.geom, extensions.st_pointonsurface(w.geom)))`);
  check(outside[0].n === 0, "all 369 wards lie inside Karnataka", `${outside[0].n} wards outside Karnataka`);
}

// ---------- events: location trigger + watchlist alerts ----------
await db.exec(`insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222')`);
await db.exec(`insert into watchlists (user_id, name, states, categories, min_severity)
  values ('11111111-1111-1111-1111-111111111111', 'Karnataka floods', '{IN-KA}', '{flood}', 3)`);
await db.exec(`insert into events (source, external_id, title, category, severity, lat, lng, occurred_at)
  values ('sachet', 'a1', 'Flood alert Bengaluru', 'flood', 4, 12.97, 77.59, now()),
         ('sachet', 'a2', 'Flood alert Patna', 'flood', 4, 25.6, 85.1, now()),
         ('ncs', 'q1', 'M3 Afghanistan', 'earthquake', 1, 35.9, 70.6, now())`);
const evs = await q("select external_id, state, district from events order by external_id");
check(evs[0].state === "IN-KA" && evs[1].state === "IN-BR" && evs[2].state === null, `event location trigger: ${JSON.stringify(evs)}`, `event location trigger: ${JSON.stringify(evs)}`);
const alerts = await q("select count(*)::int as n from alerts");
check(alerts[0].n === 1, "watchlist alert created for the Karnataka flood only", `alerts: ${alerts[0].n}`);
await db.exec(`update events set title = 'changed', title_en = 'x' where external_id = 'a1'`);
await db.exec(`update events set title_en = 'Flood (en)' where external_id = 'a2'`);
const tr = await q("select external_id, title_en from events where external_id in ('a1','a2') order by 1");
check(tr[0].title_en === null && tr[1].title_en === "Flood (en)", "title change resets translations; translation-only update keeps them", JSON.stringify(tr));

// ---------- reports: RLS, column grants, trigger, daily cap, votes ----------
const asUser = async (uid, sql, params) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await q(sql, params);
  } finally {
    await db.exec("reset role");
  }
};
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
await asUser(U1, "insert into reports (kind, description, lat, lng) values ('pothole', 'Huge pothole', 12.9756, 77.6066)");
const r = (await q("select * from reports"))[0];
check(r.state === "IN-KA" && r.pc_code === "PC:S10_25" && r.ac_code && r.user_id === U1, `report trigger filled state=${r.state} pc=${r.pc_code} ac=${r.ac_code} district=${r.district}`, `report: ${JSON.stringify(r)}`);
for (const [label, sql] of [
  ["spoofed user_id", `insert into reports (user_id, kind, description, lat, lng) values ('${U2}', 'garbage', 'xxx', 12.9, 77.6)`],
  ["setting upvotes", `insert into reports (kind, description, lat, lng, upvotes) values ('garbage', 'xxx', 12.9, 77.6, 99)`],
  ["outside India", `insert into reports (kind, description, lat, lng) values ('garbage', 'xxx', 51.5, -0.1)`],
  ["photo in someone else's folder", `insert into reports (kind, description, lat, lng, photo_path) values ('garbage', 'xxx', 12.9, 77.6, '${U2}/a.jpg')`],
]) {
  try {
    await asUser(U1, sql);
    fail(`report allowed: ${label}`);
  } catch {
    ok(`report rejected: ${label}`);
  }
}
try {
  await asUser(U2, `update reports set status = 'resolved' where id = ${r.id}`);
  const s = (await q(`select status from reports where id = ${r.id}`))[0].status;
  check(s === "open", "another user cannot resolve my report (RLS)", "another user resolved my report");
} catch {
  ok("another user cannot resolve my report");
}
try {
  await asUser(U1, `update reports set description = 'edited' where id = ${r.id}`);
  fail("reporter could edit description (column grant)");
} catch {
  ok("reporter can't edit description (column grant)");
}
await asUser(U1, `update reports set status = 'resolved' where id = ${r.id}`);
const res = (await q(`select status, resolved_at from reports where id = ${r.id}`))[0];
check(res.status === "resolved" && res.resolved_at, "reporter resolved own report; resolved_at stamped", JSON.stringify(res));
await asUser(U2, `insert into report_votes (report_id) values (${r.id})`);
const up = (await q(`select upvotes from reports where id = ${r.id}`))[0].upvotes;
check(up === 1, "vote counted via trigger", `upvotes ${up}`);
let capped = false;
for (let i = 0; i < 10; i++) {
  try {
    await asUser(U1, "insert into reports (kind, description, lat, lng) values ('garbage', 'bin overflowing', 28.63, 77.21)");
  } catch (e) {
    capped = /daily report limit/.test(e.message);
    break;
  }
}
check(capped, "daily cap of 10 reports enforced", "daily cap not enforced");

// ---------- anon cannot write ----------
await db.exec("set role anon");
try {
  await q("insert into events (source, external_id, title, category, severity, occurred_at) values ('news','z','z','other',1,now())");
  fail("anon inserted an event");
} catch {
  ok("anon cannot write events");
}
const pub = await q("select count(*)::int as n from boundaries");
check(pub[0].n > 4000, "anon can read boundaries", "anon can't read boundaries");
try {
  await q("select public.load_boundaries('[]'::jsonb)");
  fail("anon can call load_boundaries");
} catch {
  ok("anon cannot call load_boundaries");
}
await db.exec("reset role");
console.log(process.exitCode ? "\nFAILURES" : "\nALL CHECKS PASSED");
