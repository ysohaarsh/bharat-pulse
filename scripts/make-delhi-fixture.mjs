// Builds lib/transit/__fixtures__/delhi-vehicle-positions.pb: a small, deterministic GTFS-RT feed in
// the shape OTD Delhi serves (VehiclePositions). Run: node scripts/make-delhi-fixture.mjs
import { writeFileSync } from "node:fs";
import gtfs from "gtfs-realtime-bindings";

const { FeedMessage } = gtfs.transit_realtime;
const T = 1790000000; // fixed "now" so tests are stable

// [vehicle id, route id, lat, lng, speed m/s, bearing, seconds old]
const buses = [
  ["DL1PC4521", "10121", 28.6139, 77.209, 6.2, 90, 12],
  ["DL1PC4522", "10121", 28.6304, 77.2177, 0, 180, 40],
  ["DL1PD1180", "10150", 28.5562, 77.1, 11.1, 45, 8],
  ["DL1PD1181", "10150", 28.5355, 77.391, 8.3, 270, 20],
  ["DL1PB0932", "10222", 28.7041, 77.1025, 4.4, 10, 5],
  ["DL1PB0933", "10222", 28.6692, 77.4538, 13.9, 120, 31],
  ["DL1PE7710", "10305", 28.4595, 77.0266, 9.7, 200, 15],
  ["DL1PE7711", "10305", 28.4089, 77.3178, 2.8, 330, 18],
  ["DL1PA2204", "10412", 28.6519, 77.2315, 0, 0, 90],
  ["DL1PA2205", "10412", 28.6129, 77.2295, 5.5, 60, 9],
  ["DL1PF3390", "10518", 28.6862, 77.2217, 7.2, 150, 22],
  ["DL1PF3391", "10518", 28.5274, 77.2159, 10.0, 80, 6],
  ["DL1PG5566", "10633", 28.7495, 77.0565, 12.5, 355, 27],
  ["DL1PG5567", "10633", 28.5921, 77.046, 3.3, 225, 11],
  ["DL1PH9012", "10740", 28.6448, 77.3152, 6.9, 100, 14],
  ["DL1PH9013", "10740", 28.6967, 77.15, 0.5, 15, 3],
  ["DL1PJ4478", "10851", 28.5733, 77.21, 8.8, 310, 25],
  ["DL1PJ4479", "10851", 28.4817, 77.1858, 14.7, 175, 7],
];

const entity = (id, extra) => ({ id, ...extra });
const entities = buses.map(([vid, route, lat, lng, speed, bearing, age], i) =>
  entity(String(i + 1), {
    vehicle: {
      trip: { tripId: `${route}_${i}`, routeId: route },
      vehicle: { id: vid, label: vid },
      position: { latitude: lat, longitude: lng, speed, bearing },
      timestamp: T - age,
    },
  }),
);

// Awkward real-world entries the decoder must handle.
entities.push(
  // no GPS fix yet: (0,0)
  entity("90", { vehicle: { trip: { routeId: "10121" }, vehicle: { id: "DL1PZ0001" }, position: { latitude: 0, longitude: 0 }, timestamp: T - 5 } }),
  // no position at all
  entity("91", { vehicle: { trip: { routeId: "10121" }, vehicle: { id: "DL1PZ0002" }, timestamp: T - 5 } }),
  // no vehicle id (falls back to label), no speed/bearing, no route
  entity("92", { vehicle: { vehicle: { label: "LBL-77" }, position: { latitude: 28.61, longitude: 77.3 }, timestamp: T - 60 } }),
  // an older duplicate of DL1PC4521: the newer fix wins
  entity("93", { vehicle: { trip: { routeId: "10121" }, vehicle: { id: "DL1PC4521" }, position: { latitude: 28.6, longitude: 77.2, speed: 1, bearing: 0 }, timestamp: T - 300 } }),
  // a non-vehicle entity (trip update) in the same feed
  entity("94", { tripUpdate: { trip: { tripId: "x", routeId: "10121" } } }),
);

const msg = FeedMessage.create({ header: { gtfsRealtimeVersion: "2.0", incrementality: 0, timestamp: T }, entity: entities });
const bytes = FeedMessage.encode(msg).finish();
writeFileSync(new URL("../lib/transit/__fixtures__/delhi-vehicle-positions.pb", import.meta.url), bytes);
console.log(`wrote ${bytes.length} bytes, ${entities.length} entities`);
