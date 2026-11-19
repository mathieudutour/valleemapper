import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../server/api.js";

const place = (name: string) => ({ name, lat: 45.92, lon: 6.68 });
function journey(
  id: string,
  access: number,
  boarding: string,
  start: string,
  arrival = "2026-11-20T09:33:00Z",
  egress = 120,
) {
  const busEnd = new Date(+new Date(arrival) - egress * 1000).toISOString();
  const boardTime = new Date(+new Date(start) + access * 1000).toISOString();
  return {
    id,
    duration: (+new Date(arrival) - +new Date(start)) / 1000,
    startTime: start,
    endTime: arrival,
    transfers: 0,
    legs: [
      {
        mode: "WALK",
        duration: access,
        startTime: start,
        endTime: boardTime,
        from: place("START"),
        to: place(boarding),
        realTime: false,
      },
      {
        mode: "COACH",
        routeShortName: "Y85",
        duration: (+new Date(busEnd) - +new Date(boardTime)) / 1000,
        startTime: boardTime,
        endTime: busEnd,
        from: place(boarding),
        to: place("Gare"),
        realTime: false,
      },
      {
        mode: "WALK",
        duration: egress,
        startTime: busEnd,
        endTime: arrival,
        from: place("Gare"),
        to: place("END"),
        realTime: false,
      },
    ],
  };
}
const distant = journey(
  "late-departure",
  1620,
  "Distant stop",
  "2026-11-20T08:55:00Z",
);
const nearby = journey(
  "nearby-boarding",
  60,
  "Nearby stop",
  "2026-11-20T08:43:00Z",
);
const request = (mode = "transit", preference = "faster", bike = "personal") =>
  new Request(
    "http://test/api/plan?" +
      new URLSearchParams({
        from: "45.92,6.68",
        to: "45.93,6.64",
        time: "2026-11-20T08:00:00Z",
        mode,
        bike,
        preference,
      }),
  );
const plan = (itineraries: unknown[], direct: unknown[] = []) =>
  Response.json({ itineraries, direct });

test("keeps a short-walk boarding choice even when it departs earlier for the same arrival", async () => {
  const seen: URLSearchParams[] = [];
  const r = await api(request("transit", "less-walk"), {
    motis: async (path) => {
      const p = new URL("http://motis" + path).searchParams;
      seen.push(p);
      return plan(p.get("maxPreTransitTime") === "300" ? [nearby] : [distant]);
    },
  });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert(
    body.itineraries.some((j: any) => j.legs[0].duration === 60),
    "Nearby-stop itinerary was discarded",
  );
  assert(
    body.itineraries.some((j: any) => j.id === distant.id),
    "Original later-departure itinerary was removed",
  );
  assert.equal(body.itineraries[0].legs[0].to.name, "Nearby stop");
  const variants = seen.slice(1);
  assert.deepEqual(
    variants.map((p) => [
      p.get("maxPreTransitTime"),
      p.get("maxPostTransitTime"),
    ]),
    [
      ["300", "1800"],
      ["1800", "300"],
      ["300", "300"],
    ],
  );
  assert(variants.every((p) => p.get("directModes") === ""));
});

test("identical journeys returned by both searches are shown only once", async () => {
  const r = await api(request(), { motis: async () => plan([nearby]) });
  const body = await r.json();
  assert.equal(body.itineraries.length, 1);
});

test("keeps ordinary results when the short-walk search fails", async () => {
  const r = await api(request(), {
    motis: async (path) =>
      new URL("http://motis" + path).searchParams.get("maxPreTransitTime") ===
      "300"
        ? new Response("unavailable", { status: 503 })
        : plan([distant]),
  });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.itineraries[0].id, distant.id);
});

test("bike-only searches do not trigger an extra public-transport search", async () => {
  let calls = 0;
  const r = await api(request("bike"), {
    motis: async () => {
      calls++;
      return plan([], []);
    },
  });
  assert.equal(r.status, 200);
  assert.equal(calls, 1);
});

test("different boarding choices with the same upstream ID retain unique UI IDs", async () => {
  const r = await api(request(), {
    motis: async (path) =>
      plan(
        new URL("http://motis" + path).searchParams.get("maxPreTransitTime") ===
          "300"
          ? [{ ...nearby, id: distant.id }]
          : [distant],
      ),
  });
  const body = await r.json();
  assert.equal(body.itineraries.length, 2);
  assert.equal(new Set(body.itineraries.map((j: any) => j.id)).size, 2);
});

test("faster prioritises arrival time and then shorter journey duration", async () => {
  const r = await api(request("transit", "faster"), {
    motis: async (path) =>
      plan(
        new URL("http://motis" + path).searchParams.get("maxPreTransitTime") ===
          "300"
          ? [nearby]
          : [distant],
      ),
  });
  const body = await r.json();
  assert.equal(body.itineraries.length, 2);
  assert.equal(body.itineraries[0].id, distant.id);
});

test("shortest journey time can choose a later arrival than earliest-arrival preference", async () => {
  const later = journey(
    "shorter-later",
    60,
    "Nearby stop",
    "2026-11-20T11:08:00Z",
    "2026-11-20T11:28:00Z",
  );
  for (const preference of ["faster", "shorter"]) {
    const response = await api(request("transit", preference), {
      motis: async (path) =>
        plan(
          new URL("http://motis" + path).searchParams.get(
            "maxPreTransitTime",
          ) === "300"
            ? [later]
            : [distant],
        ),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(
      body.itineraries[0].id,
      preference === "shorter" ? later.id : distant.id,
    );
  }
});

test("a short walk to the bus is retained when the destination needs a longer walk", async () => {
  const longEgress = journey(
    "nearby-with-long-egress",
    60,
    "Nearby stop",
    "2026-11-20T08:43:00Z",
    "2026-11-20T09:33:00Z",
    480,
  );
  const response = await api(request("transit", "less-walk"), {
    motis: async (path) => {
      const p = new URL("http://motis" + path).searchParams;
      const shortAccess = p.get("maxPreTransitTime") === "300";
      const shortEgress = p.get("maxPostTransitTime") === "300";
      if (shortEgress) return plan([]);
      return plan(shortAccess ? [longEgress] : [distant]);
    },
  });
  const { itineraries } = await response.json();
  assert.equal(itineraries[0].id, longEgress.id);
  assert.equal(itineraries[0].legs.at(-1).duration, 480);
  assert.equal(itineraries.length, 2);
});

test(
  "a stalled alternative cannot hold up the primary or discard other ready options",
  { timeout: 2000 },
  async () => {
    const stalled: AbortSignal[] = [];
    const response = await api(request(), {
      motis: async (path, signal) => {
        const p = new URL("http://motis" + path).searchParams;
        if (!signal) return plan([distant]);
        assert.equal(p.get("timeout"), "2");
        if (
          p.get("maxPreTransitTime") === "300" &&
          p.get("maxPostTransitTime") === "1800"
        ) {
          return plan([nearby]);
        }
        stalled.push(signal);
        return new Promise<Response>(() => {});
      },
    });
    const { itineraries } = await response.json();
    assert.deepEqual(
      itineraries.map((j: { id: string }) => j.id),
      [distant.id, nearby.id],
    );
    assert.equal(stalled.length, 2);
    assert(stalled.every((signal) => signal.aborted));
  },
);

test("router errors do not expose the upstream request URL", async (context) => {
  const logger = context.mock.method(console, "error", () => {});
  const response = await api(request("bike"), {
    motis: async (path) =>
      new Response(`Failed to route: ${path}`, { status: 502 }),
  });
  assert.equal(response.status, 502);
  assert(!JSON.stringify(await response.json()).includes("45.92"));
  assert.deepEqual(logger.mock.calls[0].arguments, [
    "MOTIS route request failed",
    502,
  ]);
});

test("bike choice changes the actual routing modes", async () => {
  const cases = [
    {
      mode: "all",
      bike: "personal",
      direct: "WALK,BIKE",
      access: "WALK",
      transit: "TRANSIT",
    },
    {
      mode: "all",
      bike: "montenvelo",
      direct: "WALK,RENTAL",
      access: "WALK,RENTAL",
      transit: "TRANSIT",
    },
    {
      mode: "bike",
      bike: "montenvelo",
      direct: "RENTAL",
      access: "WALK",
      transit: "",
    },
    {
      mode: "transit",
      bike: "montenvelo",
      direct: "WALK",
      access: "WALK",
      transit: "TRANSIT",
    },
  ];
  const primary: URLSearchParams[] = [];
  for (const { mode, bike } of cases) {
    const response = await api(request(mode, "faster", bike), {
      motis: async (path, signal) => {
        if (!signal) primary.push(new URL("http://motis" + path).searchParams);
        return plan([]);
      },
    });
    assert.equal(response.status, 200);
  }
  assert.equal(primary.length, cases.length);
  for (const [index, p] of primary.entries()) {
    const { direct, access, transit } = cases[index];
    assert.equal(p.get("directModes"), direct);
    assert.equal(p.get("preTransitModes"), access);
    assert.equal(p.get("postTransitModes"), access);
    assert.equal(p.get("transitModes"), transit);
    for (const [segment, modes] of [
      ["direct", direct],
      ["preTransit", access],
      ["postTransit", access],
    ]) {
      assert.equal(
        p.get(segment + "RentalProviders"),
        modes.includes("RENTAL") ? "montenvelo" : null,
      );
      assert.equal(
        p.get(segment + "RentalFormFactors"),
        modes.includes("RENTAL") ? "BICYCLE" : null,
      );
    }
  }
});

test("MontenVélo journeys require a named return station and the selected provider", async () => {
  const rentalTrip = (
    id: string,
    providerId: string,
    toStationName?: string,
  ) => ({
    ...nearby,
    id,
    legs: [
      {
        ...nearby.legs[1],
        mode: "RENTAL",
        rental: { providerId, toStationName },
      },
    ],
  });
  const response = await api(request("bike", "faster", "montenvelo"), {
    motis: async () =>
      plan(
        [],
        [
          rentalTrip("docked", "montenvelo", "Place Charles Albert"),
          rentalTrip("street", "montenvelo"),
          rentalTrip("other", "other-provider", "Different station"),
        ],
      ),
  });
  assert.equal(response.status, 200);
  const { direct } = await response.json();
  assert.deepEqual(
    direct.map((j: { id: string }) => j.id),
    ["docked"],
  );
});
