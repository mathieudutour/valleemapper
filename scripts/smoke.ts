import assert from "node:assert/strict";
import { api } from "../server/api.js";
import { decodeLine } from "../src/types.js";
const base = process.env.APP_URL || "http://127.0.0.1:8787";
const bad = await api(
  new Request("http://test/api/plan?from=NaN,6.7&to=45.9,6.7"),
  {
    motis: async () => {
      throw Error("invalid input reached router");
    },
  },
);
assert.equal(bad.status, 400);
assert.deepEqual(decodeLine("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5), [
  [-120.2, 38.5],
  [-120.95, 40.7],
  [-126.453, 43.252],
]);
const health = await fetch(base + "/api/health").then((r) => r.json());
assert.equal(health.router, "ready");
const day = new Date();
day.setDate(day.getDate() + 1);
day.setHours(9, 0, 0, 0);
for (const [name, from, to] of [
  ["rail", "45.92634,6.719784", "45.935699,6.636458"],
  ["vertical", "45.9059848,6.6998251", "45.8909264,6.7082205"],
]) {
  const q = new URLSearchParams({
    from,
    to,
    time: day.toISOString(),
    mode: "transit",
  });
  const r = await fetch(base + "/api/plan?" + q);
  const b = await r.json();
  assert.equal(r.status, 200, JSON.stringify(b));
  const journeys = [...(b.itineraries || []), ...(b.direct || [])];
  assert(journeys.length > 0, name + " has no journeys");
  assert(
    journeys.some((j) => j.legs.some((l: any) => l.legGeometry?.points)),
    name + " has no geometry",
  );
  if (name === "rail")
    assert(
      journeys.some((j) => j.legs.some((l: any) => /RAIL/.test(l.mode))),
      "no rail option returned",
    );
  if (name === "vertical")
    assert(
      journeys.some((j) =>
        j.legs.some((l: any) => l.routeId?.startsWith("vertical_")),
      ),
      "custom lift not connected",
    );
  console.log(
    name,
    journeys.length,
    "journeys",
    journeys[0].legs.map((l: any) => l.mode).join(" / "),
  );
}
console.log(
  "Input validation, geometry decoding, native engine, journey geometry and lift connectivity verified.",
);
