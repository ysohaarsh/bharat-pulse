-- OSM moved to the GitHub "OSM relay" workflow (.github/workflows/osm-relay.yml):
-- every Overpass mirror times out from Vercel/AWS, so the pg_cron → Vercel fetch always failed.
select cron.unschedule('bharat-osm');
