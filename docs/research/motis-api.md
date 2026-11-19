# MOTIS prototype contract (verified 2026-11-18)

## Runtime pin

Latest stable release is **v2.11.4**, published 2026-10-21. No JVM required.

- [macOS ARM64 tarball](https://github.com/motis-project/motis/releases/download/v2.11.4/motis-macos-arm64.tar.bz2), SHA256 `02753c7e6487beaede33b7ea1b37e6349cb5387de8be8c35be7137d55c7da9d7`.
- [Linux AMD64 tarball](https://github.com/motis-project/motis/releases/download/v2.11.4/motis-linux-amd64.tar.bz2), SHA256 `b521bb29c961a3b994ff4dac663778ba64fee7b4cfaf3f2b20ff1d5e1d15e0dc`.
- [Release evidence](https://api.github.com/repos/motis-project/motis/releases/latest).
- [Version-pinned OpenAPI](https://github.com/motis-project/motis/blob/v2.11.4/openapi.yaml).

## Request

```text
GET /api/v6/plan
  ?fromPlace=45.925,6.7
  &toPlace=45.89,6.713
  &time=2026-11-18T12:00:00%2B01:00
  &arriveBy=false
  &transitModes=TRANSIT
  &preTransitModes=WALK
  &postTransitModes=WALK
  &directModes=WALK,BIKE
  &maxPreTransitTime=1200
  &maxPostTransitTime=1200
  &maxDirectTime=3600
  &detailedTransfers=true
  &language=fr
```

Use `URLSearchParams`; values above are illustrative coordinates. `fromPlace`/`toPlace` accept `latitude,longitude[,level]` or complete MOTIS stop ID. Times are ISO8601 date-times, `time` defaults to now. `arriveBy` defaults false. Array parameters serialize as comma-separated values. For address geocoder matches send coordinates, for STOP matches send returned ID.

- `transitModes=TRANSIT` includes rail/bus/coach/funicular/aerial lift/etc.; use empty value to disable transit.
- `directModes=WALK,BIKE` returns these in `direct`, independently of `itineraries`.
- `preTransitModes`/`postTransitModes` default `WALK`; apply only when the corresponding endpoint is coordinates, not stop ID.
- `maxPreTransitTime`/`maxPostTransitTime`: seconds, default 900, configurable server upper bound normally3600. `maxDirectTime`: seconds, default1800, bound normally21600. `pedestrianSpeed` and `cyclingSpeed`: m/s. `pedestrianProfile`: FOOT or WHEELCHAIR. `requireBikeTransport` defaultsfalse.
- Rental mode is **`RENTAL`**. Some prose still mentions `BIKE_SHARING`, which is absent from the Mode enum. Bike-share first mile: `preTransitModes=WALK,RENTAL&preTransitRentalFormFactors=BICYCLE`; optionally same for postTransit/direct. All rental params/structs are explicitly experimental. `*RentalProviders`/`*RentalProviderGroups` filter provider IDs. `*RentalPropulsionTypes` supports HUMAN/ELECTRIC/ELECTRIC_ASSIST. Keep `ignore*RentalReturnConstraints=false` (default), especially Citiz round-trip stations.
- `detailedLegs=true` default; `detailedTransfers=true` explicitly asks for transfer geometry/instructions. `useRoutedTransfers=true` selects OSM transfers (defaultfalse).
- `numItineraries` min requested, default5, meaningful with `timetableView=true` default. `maxItineraries` can limit output; `pageCursor` with unchanged other params fetches more. `searchWindow` seconds, default900.
- `realtimeMode=REALTIME` default; alternatives `REALTIME_ANNOTATION_ONLY`, `OFF`.
- `withFares=true` enables experimental fare output, only where source feeds contain supported data. Do not assume all fares present.
- Direct trips can prune slower transit options; separate transit-only and direct-only requests if needed. Current `fastestDirectFactor` default10 controls allowance for slower transit. Avoid tight maxTransfers/maxTravelTime, which can exclude useful options and worsen performance.
- Error responses400/404/422/500 have Error schema. Request timeout can use `timeout` seconds, server cap normally90.

## Response

```ts
type Plan = {
  from: Place; to: Place;
  direct: Itinerary[]; itineraries: Itinerary[];
  previousPageCursor: string; nextPageCursor: string;
  requestParameters: Record<string,string>;
  debugOutput: Record<string,number>;
};
type Itinerary = {
  id: string; duration: number; // seconds
  startTime: string; endTime: string; // ISO8601
  transfers: number; legs: Leg[]; fareTransfers?: unknown[];
};
type Place = {
  name: string; lat: number; lon: number;
  stopId?: string; parentId?: string; level?: number; tz?: string;
  arrival?: string; departure?: string;
  scheduledArrival?: string; scheduledDeparture?: string;
  track?: string; scheduledTrack?: string; cancelled?: boolean;
  arrivalTimestampReason?: string; departureTimestampReason?: string;
};
type Leg = {
  mode: string; from: Place; to: Place;
  duration: number; startTime: string; endTime: string;
  scheduledStartTime: string; scheduledEndTime: string;
  realTime: boolean; scheduled: boolean;
  legGeometry: {points:string; precision:number; length:number};
  distance?: number; // meters, non-transit legs
  displayName?: string; routeShortName?: string; routeLongName?: string;
  routeId?: string; routeType?: number; headsign?: string; tripId?: string;
  agencyName?: string; agencyUrl?: string; agencyFareUrl?: string;
  routeColor?: string; routeTextColor?: string;
  intermediateStops?: Place[]; cancelled?: boolean;
  interlineWithPreviousLeg?: boolean;
  bikesAllowed?: boolean; wheelchairAccessible?: string;
  alerts?: unknown[]; rental?: unknown;
};
```

Polyline uses Google encoding: decode using **each geometry's `precision`**, commonly6; swap `[lat,lon]` to GeoJSON/MapLibre `[lon,lat]`. Empty geometry possible if detailed output disabled. `length` counts points. Times are strings, durations seconds. Leg `realTime` means departure or arrival has actual RT evidence; do not label whole itinerary live merely because a feed exists. Derive delay from actual minus scheduled timestamps. `scheduled=false` means added service. v6 optional level is omitted if unknown. Rental contains providerId/providerGroupId/systemId plus optional systemName/url/color/fromStationName/toStationName/rentalUriWeb/formFactor/propulsionType/returnConstraint.

## Geocoding

`GET /api/v1/geocode?text=Passy&language=fr&place=45.92,6.7&numResults=8`

Returns an **array** of `{type,name,id,lat,lon,tokens,areas,score,level?,street?,houseNumber?,country?,zip?,tz?,modes?,importance?}`. `type` can filter to e.g. `ADDRESS,STOP`; `place` biases towards valley (defaultplaceBias1). `min`/`max` coordinate pairs can bound results. `numResults` default10, server cap normally512. `GET /api/v1/reverse-geocode` also exists if enabled, as do `/api/v6/map/stops` and `/api/v1/rentals`.

## Configuration / import caveats

[Version-pinned setup docs](https://github.com/motis-project/motis/blob/v2.11.4/docs/setup.md):

```yaml
server:
  host: 127.0.0.1
  port: 8080
osm: valley.osm.pbf
street_routing: true
geocoding: true
osr_footpath: true
timetable:
  first_day: TODAY
  num_days: 365
  with_shapes: true
  datasets:
    haute-savoie:
      path: feeds/haute-savoie.zip
      extend_calendar: false
    chamonix:
      path: feeds/chamonix.zip
      extend_calendar: false
      rt:
        - url: https://matching-provider.example/gtfsrt
          protocol: gtfsrt
gbfs:
  feeds:
    mont-blanc:
      url: https://gbfs.partners.fifteen.eu/gbfs/2.2/mont_blanc/en/gbfs.json
    citiz:
      url: https://backend.citiz.fr/public/provider/5/gbfs/3.0/gbfs.json
  update_interval: 60
  http_timeout: 30
```

Dataset tags cannot contain underscore; IDs are prefixed `<tag>_`. Different feeds can overlap; no duplicate merge by default. Attach GTFS-RT under matching static feed; defaults to `gtfsrt`, supports headers. Keep **extend_calendar:false** for expired/seasonal resort feeds. If false, no invented service beyond feed end. GBFS supports discovery v2/v3, manifest feeds, feed headers/OAuth, groups/colors, TTL overrides, and geofencing/return restrictions. An available car is not automatically a suitable one-way connection; respect roundtrip station rules.

`with_shapes:true` serves source shapes; absent ones are straight lines. To compute missing shapes: `route_shapes: {mode: missing}` with OSM+street_routing; may significantly increase import time. Avoid full region route-shape computation for first prototype. Elevation profile needs HGT elevation data; do not describe flat cycling estimates as slope-aware without it.

MOTIS commands per README: `motis config <osm> <gtfs...>` → `motis import` → `motis server`; default8080. OSM needed for street routing/geocoding; map tiles optional, use external base map.

## Custom frequency GTFS / vertical links

Pinned MOTIS `.pkg` references Nigiri commit `18bf63c29457e78761428c1383bc5abbe78235ae`:

- [route.cc](https://github.com/motis-project/nigiri/blob/18bf63c29457e78761428c1383bc5abbe78235ae/src/loader/gtfs/route.cc): GTFS route_type6 => AERIAL_LIFT;7 => FUNICULAR.
- [trip.cc](https://github.com/motis-project/nigiri/blob/18bf63c29457e78761428c1383bc5abbe78235ae/src/loader/gtfs/trip.cc#L378): frequencies.txt supports trip_id/start_time/end_time/headway_secs/exact_times. `exact_times=1` means scheduled; otherwise unscheduled. Headways rounded to whole minutes, minimum1. Use positive headway.

Custom service needs usual agency/stops/routes/trips/stop_times/calendar (or calendar_dates), plus frequencies. Choose agency_timezone Europe/Paris. Set trip stop_times as travel-time template, frequencies as hours, exact_times0 for explicitly approximate headways. Validate imported journey; unscheduled frequency support does not make an invented headway official. Mark all custom departures/waiting estimates prominently in UI. Do not extend seasons automatically. Source route types6/7 are supported and included by TRANSIT.

Important: [local_to_utc.h](https://github.com/motis-project/nigiri/blob/18bf63c29457e78761428c1383bc5abbe78235ae/include/nigiri/loader/gtfs/local_to_utc.h#L84) expands frequency trips into starts at `start_time + n * headway`, including unscheduled ones. [trip.h](https://github.com/motis-project/nigiri/blob/18bf63c29457e78761428c1383bc5abbe78235ae/include/nigiri/loader/gtfs/trip.h) defines the iteration. Do not rely on `Leg.scheduled` to identify custom estimated departures; annotate by custom routeId/source in the app.

## JS client

[ui/api/package.json](https://github.com/motis-project/motis/blob/v2.11.4/ui/api/package.json) declares `@motis-project/motis-client` **2.0.0**, generated from rootOpenAPI with `@hey-api/openapi-ts` and `@hey-api/client-fetch`. This is source package version, not a verified currently published npm dist-tag. Raw fetch + small app-owned types avoids package/engine drift. Generate from the pinned OpenAPI if needing full typed client.
