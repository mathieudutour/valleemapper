import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../server/api.js";
import type { StopDeparture } from "../src/types";

const busBay = "bus:region:FR:74208:ZE:57497:HAUTExSAVOIE";
const railStation = "train:sncf:StopArea:OCE87746438";
const future = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

function departureRequest(stop: string) {
  return new Request(
    "http://test/api/departures?" + new URLSearchParams({ stop }),
  );
}

test("bus boards request the selected bay and show the next three boardable departures, with cancellations, delays and alerts", async () => {
  const event = {
    mode: "COACH",
    routeShortName: "Y85",
    tripTo: { name: "Plaine Joux" },
  };
  const scheduledTime = future(5);
  const liveTime = future(10);
  const scheduled = {
    ...event,
    tripId: "scheduled",
    place: { departure: future(6), scheduledDeparture: scheduledTime },
    realTime: false,
  };
  const roadworks = {
    headerText: "Arrêt déplacé",
    descriptionText: "Travaux avenue de Genève",
  };
  const delayedFrom = future(2);
  const live = {
    ...event,
    tripId: "live",
    place: {
      departure: liveTime,
      scheduledDeparture: delayedFrom,
      alerts: [roadworks],
    },
    realTime: true,
    reservation: "COMPULSORY",
  };
  const ordinary = {
    ...event,
    tripId: "third",
    place: { departure: future(12) },
  };

  const response = await api(departureRequest(busBay), {
    motis: async (path) => {
      const url = new URL(path, "http://motis");
      assert.equal(url.pathname, "/api/v6/stoptimes");
      assert.equal(
        url.searchParams.get("stopId"),
        "region_FR:74208:ZE:57497:HAUTExSAVOIE",
      );
      assert.equal(url.searchParams.get("mode"), "BUS,COACH");
      assert.equal(url.searchParams.get("exactRadius"), "true");
      assert.equal(url.searchParams.get("radius"), "1");
      return Response.json({
        stopTimes: [
          { ...ordinary, tripId: "fourth", place: { departure: future(16) } },
          live,
          {
            ...event,
            tripId: "cancelled",
            cancelled: true,
            place: { departure: future(1), alerts: [roadworks] },
          },
          {
            ...event,
            tripId: "alighting",
            pickupDropoffType: "NOT_ALLOWED",
            place: { departure: future(2) },
          },
          { ...event, tripId: "past", place: { departure: future(-1) } },
          scheduled,
          scheduled,
          ordinary,
        ],
      });
    },
  });
  assert.equal(response.status, 200);
  const { departures, alerts } = (await response.json()) as {
    departures: StopDeparture[];
    alerts: { header: string; description?: string }[];
  };
  // A cancellation stays visible but does not take one of the three boardable places.
  assert.deepEqual(
    departures.map((d) => d.id.split(":")[0]),
    ["cancelled", "scheduled", "live", "third"],
  );
  assert.equal(departures[0].cancelled, true);
  assert.equal(departures[1].time, scheduledTime);
  assert.equal(departures[1].realTime, false);
  assert.equal(departures[1].scheduledTime, undefined);
  assert.equal(departures[2].time, liveTime);
  assert.equal(departures[2].scheduledTime, delayedFrom);
  assert.equal(departures[2].line, "Y85");
  assert.equal(departures[2].destination, "Plaine Joux");
  assert.equal(departures[2].realTime, true);
  assert.equal(departures[2].cancelled, false);
  assert.equal(departures[2].requiresReservation, true);
  assert.deepEqual(alerts, [
    { header: "Arrêt déplacé", description: "Travaux avenue de Genève" },
  ]);
});

test("rail boards query the parent station and distinguish an empty list from an unavailable service", async () => {
  const empty = await api(departureRequest(railStation), {
    motis: async (path) => {
      const params = new URL(path, "http://motis").searchParams;
      assert.equal(params.get("stopId"), "sncf_StopArea:OCE87746438");
      assert.equal(params.get("mode"), "RAIL");
      assert.equal(params.has("exactRadius"), false);
      return Response.json({ stopTimes: [] });
    },
  });
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { departures: [], alerts: [] });
  const unavailable = await api(departureRequest(railStation), {
    motis: async () => new Response(null, { status: 500 }),
  });
  assert.equal(unavailable.status, 502);
});

test("shuttle stops are queried as bus bays of their own feed", async () => {
  const response = await api(departureRequest("bus:contamines:CHEF_LIEU"), {
    motis: async (path) => {
      const params = new URL(path, "http://motis").searchParams;
      assert.equal(params.get("stopId"), "contamines_CHEF_LIEU");
      assert.equal(params.get("mode"), "BUS,COACH");
      return Response.json({ stopTimes: [] });
    },
  });
  assert.equal(response.status, 200);
});

test("departure boards reject points that are not imported bus or rail stops", async () => {
  const response = await api(departureRequest("montenvelo:cheddestation"), {
    motis: async () => assert.fail("invalid map point reached MOTIS"),
  });
  assert.equal(response.status, 400);
});
