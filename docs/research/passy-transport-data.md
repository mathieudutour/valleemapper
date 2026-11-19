# Transport data for Passy and the Pays du Mont-Blanc

Research checked on **18 November 2026**. The conclusion is that a useful Citymapper-style planner is feasible with public data. Scheduled bus/rail routing, shared-bike routing, and maps of shared cars and hitchhiking stops have good starting sources. Reliable live journeys across every mode, accurate fares, and integrated booking need further work.

**Follow-up completed:** [resort shuttles, Valléen, thermal lift and fares](shuttles-lifts-fares.md). This adds current Facilibus GTFS/live data, a matching Chamonix timetable that resolves the initial identifier mismatch, public Valléen operating JSON, vertical-link geometry, and dated fare rules.

The core area is the ten CCPMB communes: Combloux, Les Contamines-Montjoie, Cordon, Demi-Quartier, Domancy, Megève, Passy, Praz-sur-Arly, Saint-Gervais-les-Bains and Sallanches. Chamonix valley should be an adjacent coverage area because journeys continue through Servoz, Les Houches, Chamonix and Vallorcine; it is a separate community/network. [CCPMB coverage](https://www.ccpmb.fr/transport-mobilite-habitat/montenbus-transport-a-la-demande/), [Chamonix network](https://transport.data.gouv.fr/datasets/gtfs-reseau-chamonix-mobilite).

## What is available

| Service | Data found and checked | What a planner can do | Principal limitation |
|---|---|---|---|
| Cars Région Haute-Savoie | Public GTFS and NeTEx; downloaded and inspected | Route Y81–Y86 and 274 with walking connections | No corresponding public live delay feed verified |
| SNCF / TER / Léman Express / Mont-Blanc Express | Public GTFS, GTFS-RT and SIRI Lite; static and trip-update samples downloaded | Scheduled rail and relevant SNCF coach routing; add live data where matched | Local live coverage and identifiers need monitoring |
| Chamonix Mobilité | Public GTFS + GTFS-RT; matching Pysae static export verified in follow-up | Scheduled and live adjacent-valley bus routing | Use the matching Pysae export rather than the differently identified catalogue ZIP |
| MontenVélo | Public GBFS; **23 station records** in download | Bike station map, availability and bike/transit journeys | Advertised 24 stations; malformed rental links |
| Citiz | Public GBFS 3.0; **5 local stations**, 6 local vehicle records in initial sample | Shared-car locations and booking handoff | Conflicting availability fields; temporary Passy relocation |
| Rézo Pouce | **92 stops**, including **25 in Passy**, in BNLC and operator map | Signed-stop map and walking directions | No scheduled departure or guaranteed journey time |
| Montenbus | Public map KML with **392 point records** / 391 distinct coordinates | Stop map, service explanation and booking handoff | No verified live quote/booking API or GTFS-Flex; map reuse licence unresolved |
| Resort shuttles, Valléen, thermal lift | Current Facilibus GTFS/live data, other seasonal feeds, Valléen JSON and OSM geometry | Add municipal buses and vertical links | Some summer feeds expired/empty; reuse terms and closures need handling |

The numbers above are observations from actual downloads, not counts copied from promotional descriptions. Sources and evidence: [feed manifest](data/sources.json), [inspection results](data/inspection.json), [location snapshot](data/shared-mobility-locations.geojson). No route engine or booking flow was run during this research.

## Buses: the strongest starting point is the Haute-Savoie feed

The [regional dataset](https://transport.data.gouv.fr/datasets/reseau-interurbain-cars-region-haute-savoie-74) publishes timetables, stops and route geometry as GTFS and NeTEx under ODbL with PAN specific conditions. The actual downloaded GTFS advertises **11 November 2026–31 August 2027**. This is the overall feed range; individual services and calendars can expire sooner.

The downloaded file contains all seven useful regional routes listed by [CCPMB](https://sedeplacer.ccpmb.fr/transports-en-commun/lignes-regulieres/):

| Route | Corridor |
|---|---|
| Y81 | Cluses–Sallanches–Les Houches–Chamonix |
| Y82 | Praz-sur-Arly–Megève–Saint-Gervais–Chamonix |
| Y83 | Sallanches–Praz-sur-Arly–Flumet |
| Y84 | Sallanches–Saint-Gervais–Les Contamines |
| Y85 | Sallanches–Passy–Plaine-Joux, including the Le Fayet connection |
| Y86 | Sallanches–Cordon |
| 274 | Sallanches/Taninges–Geneva Airport |

The primary Passy route is [Y85](https://www.laregionvoustransporte.fr/cars-region/cars-region-de-haute-savoie/ligne/y85-sallanches-passy-plaine-joux/); its current public PDF covers 1 September–18 December 2026.

Download without a key:

```text
https://api.oura3.cityway.fr/dataflow/offre-tc/download?provider=HAUTE_SAVOIE&dataFormat=GTFS&dataProfil=OPENDATA
```

Inspection found 24 route records department-wide, 1,149 stop points and 492 parent stop areas, with shapes and transfers. There are no fare files. Trip-level wheelchair and bicycle-carriage fields are not supplied; stop accessibility is only partly populated. Do not turn missing information into a claim of accessibility or bicycle acceptance. [Resource field inventory](https://transport.data.gouv.fr/resources/80964), [download evidence](data/inspection.json).

The feed also has `N-ARAVISBUS` serving a stop in the broad catchment: some shuttle data is already present. Conversely, the separately downloaded Cars Région Express feed had no served stop in that catchment. SNCF's feed contains locally relevant E01/E04/E12 coaches, so retain those rather than filtering SNCF imports to rail only. [Express source](https://transport.data.gouv.fr/datasets/reseau-interurbain-cars-region-express), [SNCF source](https://transport.data.gouv.fr/datasets/horaires-sncf), [inspection](data/inspection.json).

## Trains and adjacent Chamonix buses

The [SNCF dataset](https://transport.data.gouv.fr/datasets/horaires-sncf) provides public static GTFS/NeTEx and live GTFS-RT/SIRI Lite. The producer describes updates about every two minutes and a roughly one-hour trip-update horizon, and cautions that TER live coverage is not guaranteed to the same extent as TGV/Intercités.

The downloaded static file covers **18 November 2026–30 April 2027** and includes **Chedde**, **Saint-Gervais-les-Bains-Le Fayet**, and **Sallanches–Combloux–Megève**. Its local routes include L3 to Coppet, P52 Saint-Gervais–Chamonix–Vallorcine and P252 towards Martigny. This confirms those timetable records are present; it does not certify complete cross-border or live coverage. [Static download](https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip), [inspection](data/inspection.json).

Key endpoints:

```text
https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip
https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates
https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-service-alerts
https://proxy.transport.data.gouv.fr/resource/sncf-siri-lite-estimated-timetable
```

In one evening sample, 448 of 540 national trip updates matched static trip IDs; two matched journeys serving the local catchment. This is an integration spot check, not a measurement of daytime coverage. Ingest `calendar_dates.txt` even when `calendar.txt` is absent, preserve coach modes, and retain the matching static version. [Evidence](data/inspection.json).

[Chamonix Mobilité](https://transport.data.gouv.fr/datasets/gtfs-reseau-chamonix-mobilite) publishes its own GTFS and a Pysae live feed with trip updates, vehicle positions and alerts, under Licence Ouverte 2.0. The inspected static calendars span **7 August–18 December 2026**. Its 23 route records include school circuits and on-demand services; that is not 23 unrestricted all-day public lines.

**Resolved in follow-up:** the initial catalogue ZIP had no matching IDs for the 237 sampled live trip updates. Pysae's documented anonymous [published GTFS endpoint](https://api.pysae.com/api/v4/groups/chamonix-bus/gtfs/pub) supplies the matching timetable: all **237 trip updates and 4,856 stop updates match**. Its actual calendars span **3 September–18 December 2026**, with 23 routes, 258 stops and 2,739 trip records. Pair this export with the [Pysae live endpoint](https://api.pysae.com/api/v4/groups/chamonix-bus/gtfs-rt); recheck after seasonal changes. [Follow-up evidence](data/followup-inspection.json), [initial comparison retained](data/inspection.json).

For wider Swiss coverage, the official [Swiss timetable platform](https://opentransportdata.swiss/en/cookbook/timetable-cookbook/) is the next source. Inspect route overlap and station identifiers before combining it with SNCF; do not assume that two records for a cross-border train are distinct services. Swiss feeds were researched but not downloaded here.

## MontenVélo: real shared bikes, with a usable open feed

[MontenVélo](https://montenvelo.fr/) advertises 130 electric bikes and 24 stations. The public GBFS download exposed **23 station records** and 129 bike records in the initial sample. All station records have coordinates and status; vehicle records include estimated remaining range. The discrepancy with announced capacity should be monitored rather than silently filled with an invented station. [GBFS discovery](https://gbfs.partners.fifteen.eu/gbfs/2.2/mont_blanc/en/gbfs.json), [inspection](data/inspection.json).

The [official station directory](https://montenvelo.fr/location/) lists four Passy sites, all present in the download: **Gare de Chedde, Marlioz, Zone de l'Arve, PAE du Mont-Blanc**.

Discovery endpoint, no key required in the checks:

```text
https://gbfs.partners.fifteen.eu/gbfs/2.2/mont_blanc/en/gbfs.json
```

It links station information/status, individual bikes, vehicle types, pricing and geofencing. The feed TTL is 60 seconds. The catalogue and system metadata declare ODbL. [PAN record](https://transport.data.gouv.fr/datasets/flux-gbfs-montenvelo), [system metadata](https://gbfs.partners.fifteen.eu/gbfs/2.2/mont_blanc/en/system_information.json).

Every inspected station's mobile rental URI contained a malformed `%!(EXTRA string=...)` value; individual-bike rental links were empty. Plan the journey using the location/status data and provide a tested app handoff independently. Also check destination docks, range and gradients. The operator's [usage advice](https://montenvelo.fr/home-2/mode-demploi/) describes urban trips with moderate climbing; a valley planner should not recommend every mountain road just because an e-bike exists nearby.

## Citiz: the five local station locations

Citiz AURA's [published feed](https://transport.data.gouv.fr/datasets/citiz-autopartage-auvergne-rhone-alpes) is regional GBFS 3.0 with a 300-second TTL. Discovery works without a key:

```text
https://backend.citiz.fr/public/provider/5/gbfs/3.0/gbfs.json
```

Follow its links: companion URLs use **`/v3.0/`**, whereas the catalogue discovery URL uses **`/3.0/`**.

The coordinates below are exactly the published station locations, rounded to six decimals. They are not verified temporary pickup locations. [Station feed](https://backend.citiz.fr/public/provider/5/gbfs/v3.0/station_information.json).

| Station ID | Published station | Latitude | Longitude |
|---|---|---:|---:|
| 1553 | Gare de Sallanches | 45.936473 | 6.635878 |
| 1554 | Parking Antoine Pissard, Sallanches | 45.937880 | 6.629606 |
| 1622 | Plateau d'Assy, Passy | 45.938592 | 6.706525 |
| 1623 | Gare du Fayet | 45.905810 | 6.700545 |
| 1698 | Parking des Cristaux, Combloux | 45.895880 | 6.644190 |

Two issues prevent treating the feed as a ready-made reservation service:

- **Pickup relocation:** Passy tourism announces works at Place Théophile Vallet through **31 December 2026**, with pickup/return instead at **1118 avenue du Dr Jacques Arnaud**, outside Passy Accueil. The feed still describes Place Théophile Vallet. Preserve the published coordinates as source data and add an explicitly dated operational correction after confirming it with Citiz. [Tourism notice](https://www.passy-mont-blanc.com/en/sejourner/se-deplacer-a-passy-mont-blanc/).
- **Availability inconsistency:** the initial station statuses counted six cars available, while the vehicle feed marked five local cars disabled and the sixth reserved. Record timestamps also differ substantially. Resolve semantics with Citiz and use its reservation flow as the source of booking truth. [Station status](https://backend.citiz.fr/public/provider/5/gbfs/v3.0/station_status.json), [vehicle status](https://backend.citiz.fr/public/provider/5/gbfs/v3.0/vehicle_status.json), [saved evidence](data/inspection.json).

The catalogue declares Licence Ouverte 2.0, while [system metadata](https://backend.citiz.fr/public/provider/5/gbfs/v3.0/system_information.json) declares CC0-1.0. Retain attribution and record that discrepancy. Instantaneous availability does not establish availability over a future booking interval or permission for a one-way rental.

## Rézo Pouce: complete local stop coordinates found

The [operator directory](https://www.rezopouce.fr/territoires/) reports 92 Pays du Mont-Blanc stops. Its [territory map](https://www.rezopouce.fr/territoires/pays-du-mont-blanc/) loads a public national GeoJSON:

```text
https://www.rezopouce.fr/data/arrets.geojson
```

Filter `properties.territory_slug == "pays-du-mont-blanc"`. The result contains 92 points, including 25 Passy points, with names, commune codes and amenity flags. This website asset is useful for comparison; its URL is not a documented stable API contract.

For a source with a declared reuse licence, use the **[consolidated BNLC](https://transport.data.gouv.fr/datasets/base-nationale-des-lieux-de-covoiturage/)**, under ODbL with PAN conditions:

```text
https://www.data.gouv.fr/api/1/datasets/r/4fd78dee-e122-4c0d-8bf6-ff55d79f3af1
```

Filter the ten commune codes in the refresh script and Mobicoop source `810157982`. The current resource resolved to a **13 November 2026** compilation. All **92 coordinates matched the operator map exactly**. The exports supplied with this report use BNLC as their source. Individual record update dates span June 2022–January 2024; compilation freshness does not mean recent inspection of each sign. [Comparison results](data/inspection.json).

| Commune | Rézo Pouce stops |
|---|---:|
| Passy | 25 |
| Les Contamines-Montjoie | 13 |
| Sallanches | 10 |
| Megève | 10 |
| Saint-Gervais-les-Bains | 8 |
| Combloux | 7 |
| Praz-sur-Arly | 6 |
| Demi-Quartier | 5 |
| Domancy | 4 |
| Cordon | 4 |

The separate [Mobicoop CSV dataset](https://transport.data.gouv.fr/datasets/arret-sur-le-pouce-aire-de-covoiturage) has an unspecified licence, making BNLC the better documented integration source. No verified public live-driver or waiting-time feed was found. Present Rézo Pouce as an optional spontaneous ride with walking access to signed stops; do not promise a fixed connection or arrival time.

## Montenbus: stop data exists, booking integration remains a gap

The official [Montenbus homepage](https://www.montenbus.fr/) links a public Google My Maps stop map. Its KML export was downloadable:

```text
https://www.google.com/maps/d/kml?mid=1eESrNKd1YaPciAGd5PIWw5HeWGrr01z9&forcekml=1
```

The export contains **392 point records, 391 distinct coordinate pairs**, grouped into Plaine, Val d'Arly, Val Montjoie and Le Fayet–Les Plagnes layers. Records carry names, coordinates and varying commune/zone/address fields. This is substantially better than manually extracting stops from a PDF, but no stable booking stop IDs, explicit data licence, update contract or confirmation of current bookability was verified. The separate [research GeoJSON](data/montenbus-stops-research.geojson) preserves those limitations.

The [2026 regulation](https://www.montenbus.fr/reglement-montenbus/) names Borini as operator. Service is Monday–Saturday 06:45–19:30, excluding public holidays, with subscription and reservation. It supplements existing transport: comparable regular services within ±15 minutes can exclude a requested journey. Eligible reduced-mobility users have different door-to-door arrangements. These constraints matter to route suggestions.

The [operator](https://www.montenbus.fr/) advertises booking up to 30 days ahead and as late as 15 minutes before departure, subject to availability. The known booking handoff is [Montenbus / Via](https://montenbus.app.ridewithvia.com/). No public GTFS-Flex, trip quote, reservation or vehicle API was verified. A map of stops alone cannot supply guaranteed journey times or train connections.

Request an authoritative stop export with stable booking IDs, operating zones/rules, reuse licence, GTFS-Flex/NeTEx if available, and a supported quote/deep-link interface from CCPMB/Borini/Via. Contact: `montenbus@ccpmb.fr`.

## Resort shuttles, vertical links and fares: follow-up results

The [detailed follow-up](shuttles-lifts-fares.md) verifies current **Facilibus** timetables and matching live data; public seasonal **Meg-Bus, Combloux and Praz** feeds; **Contamines** Zenbus endpoints; and **Sallanches** GIS stops/times. Several currently published feeds are expired or empty, and the Cordon-labelled group currently returns unrelated data. The inventory records which sources can actually supply current departures.

**Valléen** operating JSON is publicly readable through the operator's Lumiplay map, and both vertical links have mapped terminal/line geometry. The thermal lift still needs a supported structured status source. Dated maintenance and pass eligibility are documented in the follow-up.

Published **Y81–Y86 singles are €1.70** under the regional tariff effective March 2026. Chamonix singles vary by sales channel. Basic bus/lift and subscription prices are now recorded in a [curated research seed](data/fare-rules-research.json); no complete cross-mode quote API was verified. Tramway du Mont-Blanc and other tourist mountain links remain outside the verified core coverage.

## A practical route to a first version

These are implementation recommendations inferred from the evidence, not a tested deployment:

1. **Start with walking + scheduled regional buses + SNCF + Chamonix buses.** Use OpenStreetMap for real walking/cycling paths, entrances and crossings; do not use straight-line distance to calculate transfers. Feed calendars and exceptions govern service availability.
2. **Add MontenVélo to routing and map the 120 shared-mobility sites.** That is 23 bike stations + 5 Citiz stations + 92 Rézo Pouce stops. Citiz and Rézo Pouce initially need a handoff/uncertainty presentation rather than guaranteed end-to-end itineraries.
3. **Overlay real time selectively.** Use Chamonix's matching Pysae export and current Facilibus feeds, monitor identifiers and age, and fall back visibly to scheduled times. Resolve Citiz's conflicting statuses before trusting its availability.
4. **Add the verified shuttles, vertical links and Montenbus.** Follow seasonal calendars and closures, obtain missing reuse terms and booking constraints, and display booking-required options with their restrictions.
5. **Start with curated simple fares and provider handoffs.** Published bus/lift prices are documented; rail and complex car quotes still need authoritative provider integration. Integrated purchases are a separate step.

**OpenTripPlanner is a strong candidate to evaluate:** its core inputs are OpenStreetMap, GTFS/GTFS-RT and GBFS, matching the data above. Its 2.9 release notes describe GBFS 3.0 support as experimental, so test the chosen release against Citiz rather than assuming compatibility. [OTP data sources](https://docs.opentripplanner.org/en/latest/Data-Sources/), [release notes](https://docs.opentripplanner.org/en/v2.9.0/Changelog/).

Java is optional: [stack research](transport-stack.md) compares OTP's JVM server with native C++ MOTIS and explains Transportr's existing-provider client architecture. If avoiding a JVM is a preference, MOTIS is the first alternative to prototype; no engine has yet been tested end-to-end with these valley feeds.

Use a backend to refresh, cache and validate feeds; public readability does not establish browser CORS support or unlimited polling. Poll live feeds according to their TTL, watch timetable expiry and changed resource URLs, preserve provenance, and validate useful origin/destination examples across weekdays, weekends and holiday seasons. Existing [Oùra routing](https://www.oura.com/) is a useful coverage benchmark linked by CCPMB; no public right to reuse its journey-planning API was established here.

Licences differ by source. Preserve attribution and source-specific conditions; PAN's ODbL guidance describes sharing obligations for improvements to transport data, while OpenStreetMap has its own licence treatment. The Montenbus map's reuse terms and Citiz's metadata discrepancy remain explicit research items. [PAN licence guidance](https://doc.transport.data.gouv.fr/le-point-d-acces-national/cadre-juridique/conditions-dutilisation-des-donnees/licence-odbl).

## Files supplied

- [Source manifest with exact endpoints](data/sources.json).
- [Direct inspection evidence](data/inspection.json), including static/live identifier comparison and Citiz inconsistency.
- [Shared mobility locations, CSV](data/shared-mobility-locations.csv) and [GeoJSON](data/shared-mobility-locations.geojson): 120 dated site records, with source and caveats.
- [Montenbus map extract, GeoJSON](data/montenbus-stops-research.geojson): 392 research records; reuse rights and bookability unverified.
- [Location refresh script](scripts/refresh_locations.py): Python standard library only; run `python3 scripts/refresh_locations.py` from this folder. It refreshes locations and station status snapshots, not the static/live timetable audit.
- [Shuttle, lift and fare follow-up](shuttles-lifts-fares.md), with additional source manifests, research exports and dated pricing rules.

This research verifies that the central ingredients exist and identifies concrete integration defects. A prototype is justified now; a reliable all-mode planner still needs local routing checks and the targeted provider clarifications above.
