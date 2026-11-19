# Journey-planner stack choices

Checked 18 November 2026 against current project sources and documentation. This is architecture research; no routing engine was deployed or benchmarked against the valley feeds.

## Java is optional

OpenTripPlanner runs its routing server on a Java virtual machine. Its documented container includes the runtime, so an application can call it over HTTP without containing Java application code. Operating it still means running a JVM-backed server, importing the feeds/street graph, updating data and allocating memory. [OTP overview](https://docs.opentripplanner.org/), [container documentation](https://docs.opentripplanner.org/en/latest/Container-Image/).

MOTIS provides another route: a native C++ engine with a JSON/HTTP REST interface and generated JS/TS client. Its build uses C/C++, and its container runs the native executable. It accepts multiple GTFS/NeTEx timetables, live transport feeds, GBFS and an OpenStreetMap extract. [Project](https://github.com/motis-project/motis), [build configuration](https://github.com/motis-project/motis/blob/master/CMakeLists.txt), [container](https://github.com/motis-project/motis/blob/master/Dockerfile).

| Approach | Server operation | Main consequence for this valley project |
|---|---|---|
| OpenTripPlanner | JVM server, optionally containerized | Import our feeds and control coverage; application language remains independent |
| MOTIS | Native C++ server, optionally containerized | Import our feeds and control coverage without running Java |
| Existing hosted planner | Call its HTTP interface | Avoid hosting a routing engine, but inherit its coverage, features and access terms |

Both self-hosted engines still need a deployment and data-refresh process. A map library alone does not calculate transit connections. [MOTIS configuration](https://github.com/motis-project/motis/blob/master/docs/setup.md), [OTP data sources](https://docs.opentripplanner.org/en/latest/Data-Sources/).

## What Transportr actually does

Source inspected at commit `35bbbd6fd7f948f879595d90a4f249118727bbd1`, dated 30 October 2026. Transportr is a native Android app written in Kotlin/Java. Its Java 17 build toolchain concerns building that Android app, rather than requiring a Java routing server. [Build configuration](https://github.com/grote/Transportr/blob/35bbbd6fd7f948f879595d90a4f249118727bbd1/app/build.gradle).

The app sends journey requests through the Public Transport Enabler library's selected `NetworkProvider`. Its trip repository calls `queryTrips` and `queryMoreTrips`; departure boards call `queryDepartures`. The selected remote planner supplies the journey calculations. Transportr provides the Android interface, maps, favourite places and presentation of trips/departures. [Trip requests](https://github.com/grote/Transportr/blob/35bbbd6fd7f948f879595d90a4f249118727bbd1/app/src/main/java/de/grobox/transportr/trips/search/TripsRepository.kt), [departures](https://github.com/grote/Transportr/blob/35bbbd6fd7f948f879595d90a4f249118727bbd1/app/src/main/java/de/grobox/transportr/departures/DeparturesLoader.java#L57), [PTE](https://github.com/schildbach/public-transport-enabler).

Its compiled provider catalogue has no dedicated France, Oùra, Rhône-Alpes or Passy entry. Europe-wide rail and Swiss providers exist, so that does not establish an absence of all French rail results; local valley coverage was not tested. The checked settings do not accept arbitrary GTFS ZIPs or an arbitrary routing-server URL. Connecting our own router would require a provider adapter and app registration. [Catalogue](https://github.com/grote/Transportr/blob/35bbbd6fd7f948f879595d90a4f249118727bbd1/app/src/main/java/de/grobox/transportr/networks/TransportNetworks.kt), [settings](https://github.com/grote/Transportr/blob/35bbbd6fd7f948f879595d90a4f249118727bbd1/app/src/main/res/xml/preferences.xml).

For our project, Transportr illustrates the existing-provider approach. It cannot by itself combine the collected regional GTFS, local shuttle feeds, bikes and supplemental lifts into a new routing network. Using it as an Android client is possible with integration work; importing and controlling the valley data still needs a suitable routing backend. This is an inference from the call paths above. Its code is GPLv3-or-later if adapted/distributed. [Licence](https://github.com/grote/Transportr/blob/35bbbd6fd7f948f879595d90a4f249118727bbd1/README.md#license).

## Suggested first evaluation

Recommendation, rather than a completed compatibility test: evaluate **MOTIS with a TypeScript web app** first if avoiding a JVM is a preference. Use MapLibre for the map and a small TypeScript backend for local fare rules, supplemental status and booking handoffs. The MOTIS HTTP interface separates routing from the application's programming language. [MOTIS interface and JS client](https://github.com/motis-project/motis#readme), [MapLibre](https://maplibre.org/maplibre-gl-js/docs/).

The first evaluation should import the current regional, SNCF, Chamonix and Facilibus timetables with a local OSM extract; verify walking connections and identifier matching; then add bike availability and the two vertical links. Use the seasonal and pricing caveats already recorded in [the data research](passy-transport-data.md). The source formats are supported, but the specific valley combination, custom lift representation, bike routing and hosting size remain untested.

Keep local pricing/booking rules explicit: format support cannot repair a missing tariff, contradictory Citiz availability or a reservation-only Montenbus journey. This is an inference from the [verified data gaps](shuttles-lifts-fares.md), not an engine defect.

## A hosted MOTIS option

Transitous runs a hosted MOTIS service. Its public API is intended for open-source, non-commercial projects with light resource use, on a best-effort basis; commercial use is excluded by its current policy. Lightweight prototype testing before publishing source is explicitly permitted. Complete coverage of the valley's supplemental feeds was not verified here, and a hosted instance does not let a client silently add its own missing routing connections. [Transitous policy](https://transitous.org/api/).

## Hosting on Cloudflare

**Yes, including the routing engine through Cloudflare Containers.** Containers run Linux applications and existing images, with Workers handling requests and lifecycle. They are available on the Workers Paid plan. This is a deployment option inferred from the documented runtimes; neither MOTIS nor OTP was deployed to Cloudflare during this research. [Containers overview](https://developers.cloudflare.com/containers/).

The deployed image must support **linux/amd64**. Select or build that target rather than assuming an image built on an ARM Mac is compatible. [Container prerequisites](https://developers.cloudflare.com/containers/get-started/).

| Part | Cloudflare product | Role |
|---|---|---|
| TypeScript web app / MapLibre | Workers Static Assets | Serve the browser application |
| Application HTTP interface | Worker | Local rules, status, caching and forwarding journey searches |
| MOTIS | Container | Native routing process and locally loaded/preprocessed data |
| Feed snapshots and prepared routing data | R2 | Durable objects/files used to rebuild or restore a routing instance |
| Optional small application database | D1 | Curated fares, preferences and metadata; not the engine's routing graph |

Cloudflare documents the same [static-frontend/container-backend pattern](https://developers.cloudflare.com/containers/examples/container-backend/), with [static assets](https://developers.cloudflare.com/workers/static-assets/) served alongside the Worker. A regular Worker is not a drop-in host for the native MOTIS executable or OTP's JVM; its isolate has a **128 MB** memory limit, including WebAssembly allocations. [Worker limits](https://developers.cloudflare.com/workers/platform/limits/).

Current default maximum container resources are **4 vCPU, 12 GiB RAM and 20 GB disk** per instance; larger limits require a request to Cloudflare. Whether a useful valley import fits, and its startup/query latency, remain benchmark questions. Avoid treating the national feed ZIP sizes as the engine's memory footprint. [Container limits](https://developers.cloudflare.com/containers/platform/limits/).

The filesystem is **ephemeral by default** and resets after sleep. Cloudflare now offers immutable filesystem snapshots for the `durable_object` scheduling policy, currently in public beta, with a 30-day retention period refreshed on restore. These preserve filesystem data, not a running process or its loaded RAM. R2 is another durable store; copying prepared files to local container disk is an alternative to relying on a live FUSE-mounted routing database. [Storage FAQ](https://developers.cloudflare.com/containers/faq/), [snapshots](https://developers.cloudflare.com/containers/guides/snapshots/).

Recommended first test: one shared routing instance for the valley, prepared data loaded before serving requests, health checks, and an explicit choice between keeping it warm and accepting reload time after sleep. Build new data away from the request path and publish a versioned artifact. This is an implementation recommendation, not a measured startup or availability guarantee.

The Workers Paid plan starts at **$5/month**; Containers incur additional usage charges beyond the included allowance. Provisioned memory and disk are billed while the instance runs, including idle time; CPU is billed for actual active usage. Workers, Durable Objects and other products have their own metering. Keeping a router warm therefore has a recurring resource cost even with few journey requests. [Current pricing](https://developers.cloudflare.com/containers/platform/pricing/).
