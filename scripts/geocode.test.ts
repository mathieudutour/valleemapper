import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../server/api.js";

const street = {
  type: "ADDRESS",
  name: "Rue des Érables",
  lat: 45.923,
  lon: 6.686,
  areas: [{ name: "Passy" }],
};
const stop = {
  type: "STOP",
  name: "Gare de Chedde",
  lat: 45.92634,
  lon: 6.719784,
};
const fixture = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [6.681, 45.924] },
      properties: {
        type: "housenumber",
        housenumber: "42",
        name: "42 Rue des Érables",
        city: "Passy",
        postcode: "74190",
        score: 0.97,
      },
    },
  ],
};
const request = (query: string) =>
  new Request("http://test/api/geocode?" + new URLSearchParams({ q: query }));

test("numbered addresses resolve to the house, ahead of a street-only match", async () => {
  let calls = 0;
  const response = await api(request("42 rue des Érables Passy"), {
    motis: async () => Response.json([street, stop]),
    addressFetch: async (url: string) => {
      calls++;
      const q = new URL(url).searchParams;
      assert.equal(q.get("index"), "address");
      assert.equal(q.get("q"), "42 rue des Érables Passy");
      return Response.json(fixture);
    },
  });
  const results = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(results[0].houseNumber, "42");
  assert.equal(results[0].name, "42 Rue des Érables");
  assert.equal(results[0].lat, 45.924);
  assert.equal(results[0].lon, 6.681);
  assert.equal(results[0].source, "IGN/BAN");
  assert(results.some((p: any) => p.type === "STOP"));
});

test("station searches stay local and keep their results", async () => {
  let calls = 0;
  const response = await api(request("Gare de Chedde"), {
    motis: async () => Response.json([stop]),
    addressFetch: async () => {
      calls++;
      return Response.json(fixture);
    },
  });
  assert.equal(calls, 0);
  assert.deepEqual(await response.json(), [stop]);
});

test("address service failures keep local fallback and do not invent a house number", async () => {
  const response = await api(request("42 rue des Érables Passy"), {
    motis: async () => Response.json([street]),
    addressFetch: async () => {
      throw Error("offline");
    },
  });
  const results = await response.json();
  assert.equal(response.status, 200);
  assert.equal(results[0].houseNumber, undefined);
  assert.equal(results[0].precision, "street");
});

test("out-of-valley address matches are discarded", async () => {
  const response = await api(request("42 rue des Érables"), {
    motis: async () => Response.json([]),
    addressFetch: async () =>
      Response.json({
        ...fixture,
        features: [
          {
            ...fixture.features[0],
            geometry: { type: "Point", coordinates: [2.35, 48.85] },
          },
        ],
      }),
  });
  assert.deepEqual(await response.json(), []);
});

test("local house numbers are retained in the visible address name", async () => {
  const response = await api(request("42 rue des Érables Passy"), {
    motis: async () => Response.json([{ ...street, houseNumber: "42" }]),
    addressFetch: async () => {
      throw Error("offline");
    },
  });
  const results = await response.json();
  assert.equal(results[0].name, "42 Rue des Érables");
  assert.equal(results[0].precision, "housenumber");
});

test("national addresses remain usable when the route engine is unavailable", async () => {
  const response = await api(request("42 rue des Érables Passy"), {
    motis: async () => {
      throw Error("router unavailable");
    },
    addressFetch: async () => Response.json(fixture),
  });
  const results = await response.json();
  assert.equal(response.status, 200);
  assert.equal(results[0].houseNumber, "42");
});
