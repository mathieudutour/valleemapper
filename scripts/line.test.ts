import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../server/api.js";
import type { LineDetails } from "../src/types";

const coachTrip =
  "20261123_15:30_region_HAUTExSAVOIE:ServiceJourney:1077976x1123871:LOC";
const railTrip = "20261123_14:10_sncf_OCESN18920F1187";
const future = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

function lineRequest(trip: string, at?: string) {
  return new Request(
    "http://test/api/line?" + new URLSearchParams(at ? { trip, at } : { trip }),
  );
}
const stop = (name: string, times: Record<string, string>) => ({
  name,
  stopId: "region_" + name,
  lat: 45.9,
  lon: 6.7,
  ...times,
});

test("a line lists every stop of the run, finds where the rider boards and the runs that follow there", async () => {
  const boarding = future(30);
  const delayedTo = future(42);
  const roadworks = { headerText: "Déviation", descriptionText: "Travaux" };
  const event = {
    routeId: "region_Y85",
    directionId: "1",
    realTime: false,
    place: {},
  };
  const requests: string[] = [];
  const response = await api(lineRequest(coachTrip, boarding), {
    motis: async (path) => {
      const url = new URL(path, "http://motis");
      requests.push(url.pathname);
      if (url.pathname === "/api/v6/trip") {
        assert.equal(url.searchParams.get("tripId"), coachTrip);
        return Response.json({
          legs: [
            {
              mode: "COACH",
              routeShortName: "Y85",
              routeLongName: "SALLANCHES > PASSY",
              routeId: "region_Y85",
              directionId: "1",
              agencyName: "REGION - cars Région Haute-Savoie",
              agencyUrl: "https://www.laregionvoustransporte.fr/",
              realTime: true,
              reservation: "COMPULSORY",
              alerts: [roadworks, roadworks],
              from: stop("Plaine Joux", { departure: future(10) }),
              intermediateStops: [
                stop("Chef-lieu", {
                  arrival: boarding,
                  departure: boarding,
                  scheduledDeparture: boarding,
                }),
                stop("Marlioz", {
                  departure: delayedTo,
                  scheduledDeparture: future(40),
                }),
              ],
              to: stop("Gare", { arrival: future(60) }),
              legGeometry: { points: "abc", precision: 6 },
            },
          ],
        });
      }
      assert.equal(url.pathname, "/api/v6/stoptimes");
      assert.equal(url.searchParams.get("stopId"), "region_Chef-lieu");
      assert.equal(url.searchParams.get("time"), boarding);
      assert.equal(url.searchParams.get("exactRadius"), "true");
      return Response.json({
        stopTimes: [
          { ...event, place: { departure: boarding } },
          { ...event, routeId: "region_Y84", place: { departure: future(35) } },
          { ...event, directionId: "0", place: { departure: future(36) } },
          { ...event, cancelled: true, place: { departure: future(50) } },
          {
            ...event,
            pickupDropoffType: "NOT_ALLOWED",
            place: { departure: future(55) },
          },
          {
            ...event,
            realTime: true,
            place: { departure: future(95), scheduledDeparture: future(90) },
          },
        ],
      });
    },
  });
  assert.equal(response.status, 200);
  const line = (await response.json()) as LineDetails;
  assert.deepEqual(requests, ["/api/v6/trip", "/api/v6/stoptimes"]);
  assert.equal(line.name, "Y85");
  assert.equal(line.longName, "SALLANCHES > PASSY");
  assert.equal(line.operatorUrl, "https://www.laregionvoustransporte.fr/");
  assert.equal(line.requiresReservation, true);
  assert.equal(line.realTime, true);
  assert.deepEqual(line.alerts, [roadworks]);
  assert.deepEqual(
    line.stops.map((s) => s.name),
    ["Plaine Joux", "Chef-lieu", "Marlioz", "Gare"],
  );
  assert.equal(line.board, 1);
  // A realtime update keeps the timetabled time next to the expected one.
  assert.equal(line.stops[2].time, delayedTo);
  assert.ok(line.stops[2].scheduledTime);
  assert.equal(line.stops[1].scheduledTime, undefined);
  assert.equal(line.stops[3].stopId, "region_Gare");
  assert.deepEqual(line.geometry, [{ points: "abc", precision: 6 }]);
  // Only the same line in the same direction, boardable and running; the rider's own run comes first.
  assert.equal(line.passings?.length, 2);
  assert.deepEqual(line.passings?.[0], { time: boarding, realTime: false });
  assert.equal(line.passings?.[1].realTime, true);
  assert.equal("directionId" in line, false);
});

test("a line opened without a boarding time, or with one the run does not match, asks for no passings", async () => {
  for (const at of [undefined, future(5)]) {
    const requests: string[] = [];
    const response = await api(lineRequest(railTrip, at), {
      motis: async (path) => {
        requests.push(new URL(path, "http://motis").pathname);
        return Response.json({
          legs: [
            {
              mode: "REGIONAL_RAIL",
              routeShortName: "",
              from: stop("Le Fayet", { departure: future(20) }),
              to: stop("Chamonix", { arrival: future(60) }),
            },
          ],
        });
      },
    });
    const line = (await response.json()) as LineDetails;
    assert.deepEqual(requests, ["/api/v6/trip"]);
    assert.equal(line.name, "TER");
    assert.equal(line.board, undefined);
    assert.equal(line.passings, undefined);
    assert.deepEqual(line.geometry, []);
  }
});

test("rail passings are asked of the whole station, and the page survives without them", async () => {
  const boarding = future(20);
  const response = await api(lineRequest(railTrip, boarding), {
    motis: async (path) => {
      const url = new URL(path, "http://motis");
      if (url.pathname === "/api/v6/trip")
        return Response.json({
          legs: [
            {
              mode: "REGIONAL_RAIL",
              routeShortName: "P52",
              from: stop("Le Fayet", { departure: boarding }),
              to: stop("Chamonix", { arrival: future(60) }),
            },
          ],
        });
      assert.equal(url.searchParams.has("exactRadius"), false);
      return new Response(null, { status: 500 });
    },
  });
  assert.equal(response.status, 200);
  const line = (await response.json()) as LineDetails;
  assert.equal(line.board, 0);
  assert.deepEqual(line.passings, []);
});

test("line requests are validated before the router is asked, and its failures are told apart", async () => {
  for (const trip of [
    "",
    "bogus",
    // The lifts run on modelled times, so they have no line page.
    "20261124_09:02_vertical_valleen-0",
    "20261123_15:30_region_\u0000",
  ]) {
    const response = await api(lineRequest(trip), {
      motis: async () => assert.fail("MOTIS must not be asked"),
    });
    assert.equal(response.status, 400);
  }
  const gone = await api(lineRequest(coachTrip), {
    motis: async () =>
      Response.json({ error: "trip not found" }, { status: 404 }),
  });
  assert.equal(gone.status, 404);
  const down = await api(lineRequest(coachTrip), {
    motis: async () => new Response(null, { status: 500 }),
  });
  assert.equal(down.status, 502);
  const empty = await api(lineRequest(coachTrip), {
    motis: async () => Response.json({ legs: [] }),
  });
  assert.equal(empty.status, 404);
});
