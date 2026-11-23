# Prototype validation · 18 November 2026

Environment: macOS arm64, Node 26.12.1, MOTIS 2.11.4.

## Passed

- Native executable checksum and full import: timetable, OSM street graph, geocoder, stop matching and street footpaths.
- Initial map cleanup retained 109,843 ways / 1,178,050 nodes, removed 44 empty or incomplete ways; resulting PBF 11,986,773 bytes.
- Initial selected feeds: Cars Région 324 trips, SNCF 382, Chamonix 2,730, Facilibus 54. Calendars are not extended.
- `npm run build`: TypeScript frontend/API and Worker checks; Vite production assets, including a separately bundled map worker.
- `npm run smoke`: invalid coordinates rejected before calling MOTIS; known polyline decoded at the correct precision; engine readiness; real rail results with geometry; custom lift connected to walking access.
- Le Fayet → Saint-Gervais, 19 Nov 2026 09:00: seven-minute result including walking and the five-minute estimated Valléen leg. Estimated times are labelled in the summary and each lift leg.
- Chedde → Sallanches, 19 Nov 2026 morning: train connections and Y85 bus alternatives returned. Origin/destination names are displayed in place of MOTIS START/END placeholders.
- Address lookup for Avenue du Docteur Jacques Arnaud returned eight geocoder results.
- `/api/bikes`: 23 station statuses, recent source timestamp and 60-second TTL; selected station card displayed six bikes and four docks at the test instant. Counts are live and will change.
- Keyboard autocomplete selected Lac de Passy; personal-bike routing returned a real street journey with geometry.
- Desktop and 390×844 mobile browser checks: map rendered, route controls, mobile map/list switch, no horizontal overflow, point selection and bike detail card.
- Cloudflare Wrangler dry run: Worker bundle, assets, Container binding and Durable Object-managed configuration. No deployment.

## Not verified

- Linux Docker build/startup and actual Cloudflare deployment: Docker is unavailable on this Mac.
- Real-world transfer feasibility, accessibility, gradients, comprehensive disruption coverage and ticket totals.
- GBFS rental journey integration, car booking, hitchhiking wait prediction and on-demand routing are outside this prototype.

The public OpenFreeMap style produces three benign road-shield filter warnings with MapLibre 6.19.0; map tiles and application layers render. No application runtime errors remain after the map worker/container sizing fixes.

## Address lookup fix · 19 November 2026

The original local geocoder returned a street location for a numbered Passy address; the current OSM extract did not contain that house number at its location. The IGN/BAN geocoder returned the numbered address and a distinct, verified point. Street/number searches now merge national address results with local MOTIS places and stops. The UI preserves numbers and identifies street-only fallbacks.

- Six API-level regression tests pass: numbered-address priority and coordinates, local-only station searches, unavailable address service, geographical bounds, local number formatting, and unavailable router. Test fixtures contain synthetic addresses.
- The original exact-address API repro now passes, and six real journey alternatives start from the verified house coordinates. Browser selection sends those coordinates to the route planner.
- Frontend, Node API and Worker type/build checks and Wrangler dry run pass.
- Docker Desktop 4.99.0 and Engine 29.9.3 are installed; Compose 5.7.0 and Buildx 0.38.1 work. The official hello-world linux/amd64 container ran successfully. The project-specific Linux image is still not built or deployed.

IGN/BAN documentation: https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/

## Routing preferences and transit map layers · 19 November 2026

The Y85 stop Le Crey was present and walkable in the data. An ordinary departure/arrival search omitted its boarding option because walking to La Carabote caught the same bus after a long loop, with a later departure from the origin and the same arrival. A bounded second search now retains nearby boarding options.

- Real-feed reproduction on 20 November: Le Crey 09:44 to Gare 10:31, with one minute of access walking and two minutes at the destination. The former La Carabote alternative uses 29 minutes of total walking; both arrive at 10:33.
- Preferences distinguish earliest arrival, shortest journey duration, and least walking. The shortest-duration preference can choose a later arrival. They rank the available computed candidates, rather than promising a global optimum across every departure.
- Thirteen API regression tests pass, including retaining nearby-stop alternatives, deduplication, graceful fallback, distinct IDs, bike-only behavior, and preference ranking.
- Transit map export produces 515 bus boarding points and 21 rail stations, grouped from rail platforms. Le Crey is selectable and rail stations Sallanches and Chedde appear once each. Source references and served routes are included in the point records.
- Default layers: bus, MontenVélo, rail stations, vertical links. Vertical-link line visibility follows its toggle. Points support origin and destination actions, with nearby interchange points selectable from their card.

Browser checks for the final controls: the four default layers are checked; Le Crey opens a bus card showing Y85; Sallanches opens a rail card and its nearby bus points can be selected independently. Rail origin and bus destination actions populate the form. At 390 px, all three preference controls fit without horizontal overflow, the shortest-time description is correct, and the map button does not cover the search button.

## Design review fixes · 19 November 2026

The Explorer tab is replaced by a **Couches** button over the map. On phones the planner is a bottom sheet over a full-screen map. Searches, the selected place and non-default layers are kept in the page URL.

- Route shapes: a scratch import with `route_shapes: missing` matched SNCF routes onto OSM tracks. P52 Chedde → Saint-Gervais grew from 2 to 71 points and P52 Saint-Gervais → Chamonix from 12 to 659. Cars Région and Chamonix bus shapes are unchanged. The local graph used by `npm run dev` needs `npm run setup` to pick this up.
- Twenty-two API regression tests pass, including a new arrival-deadline test: `arriveBy` reaches MOTIS, invalid values are rejected and the latest departure ranks first.
- Browser checks at 1440×900, 1280×720 and 390×664 (iPhone 14), in light and dark schemes:
  - An automated scan found no text below WCAG AA contrast on the home, results and layer views.
  - A 20:14 search shows next-morning trips under a "Demain · vendredi 20 novembre" heading with a **Demain** chip.
  - Autocomplete shows a type and commune per entry ("Chef-lieu · Arrêt de bus · Passy").
  - The selected stop has a ring on the map, and unrelated stops fade while a route is shown.
  - Changed settings re-run the search when the dialog closes.
  - Tab moves between fields with one suggestion list open.
  - A missing departure marks the field and shows the message under it.
  - On the phone, the sheet snaps by drag and tap, a tapped stop opens its card in the half sheet, and map controls stay above the sheet.

## Paging, position, disruptions, recent trips and directions · 20 November 2026

- **Paging:** `/api/plan` forwards a validated `cursor` as MOTIS `pageCursor` and returns MOTIS's previous and next cursors. On Passy → Sallanches at 09:00, **Plus tard** added trips up to 21:02 and **Plus tôt** added early-morning ones; walking and cycling alone are not repeated per page.
- **Disruptions:** the SNCF service-alerts feed (`sncf-gtfs-rt-service-alerts`, listed on transport.data.gouv.fr with the SNCF dataset) is added to the import config. A scratch import loaded 467 SNCF alerts, none affecting imported trips that day. Chamonix and Facilibus already publish alerts; a Chamonix line 4 detour appears on its stops' departure boards. The operator gave that alert no validity period, so it stays visible after the date it describes. Boards keep cancelled departures, marked "Supprimé", and show delays against the scheduled time. Journey cards show delay, cancellation and disruption badges; checked with a real plan response altered in the browser.
- **Ma position** is offered first in both fields. A position outside the Pays du Mont-Blanc is refused with a message. Shared links round it to four decimals and name it "Position partagée".
- **Recent trips** are kept in local storage (six at most, positions stored without coordinates) and can be cleared. The last trip prefills the form unless it used a position.
- **Directions:** MOTIS 2.11.4 marks every walking and cycling step `CONTINUE`, so turns are computed from step geometry. Passy chef-lieu → Lac de Passy gives 14 steps, such as "Prenez légèrement à gauche sur Place de la Mairie".
- Twenty-three API tests pass, including new cursor and departure-board disruption tests.

## Slope-aware bike times · 20 November 2026

- **Import:** the four elevation tiles load in the local MOTIS import ("Calculating way elevations"), and bike and MontenVélo steps report climb and descent. Before retiming, Le Fayet → Saint-Gervais (3.3 km, about 250 m up) took 13 min each way.
- **Noise:** raw step totals add 30–90 m of false climbing; 200 m smoothing brings flat valley routes to within a minute of MOTIS (Chamonix → Les Praz 15 → 15 min, Sallanches → Chedde 32 → 33 min).
- **Climbs and descents** (own bike / MontenVélo, MOTIS was 13 or 33 min):

  | Route | Climb | Own bike | MontenVélo |
  | --- | --- | --- | --- |
  | Le Fayet → Saint-Gervais | ↗ 248 m | 26 min | 19 min |
  | Saint-Gervais → Le Fayet | ↘ 245 m | 9 min | 9 min |
  | Le Fayet → Plateau d’Assy | ↗ 699 m | 71 min | 51 min |
  | Plateau d’Assy → Le Fayet | ↘ 683 m | 26 min | 25 min |

- **Timing:** direct rides keep the requested departure (or the arrival for an arrival deadline). In a MontenVélo + coach journey the coach keeps its times and the ride before it moves. Leg times move by whole minutes, as MOTIS gives them; durations stay to the second.
- **Interface:** journey cards and bike legs show "↗ 700 m ↘ 40 m"; screen readers hear "montée de 700 m, descente de 40 m". Checked at desktop size and 375×812 in the dark theme, with no horizontal overflow.
- **Bike choice:** the settings offer **Mon vélo électrique**, **Mon vélo** and **MontenVélo**, with MontenVélo selected by default (`velo` is left out of shared links for it). Le Fayet → Plateau d’Assy on an own e-bike shows 51 min with a "Mon vélo électrique" tag; on an own bike, 71 min. Checked at desktop size and 375×812.
- Thirty-four API tests pass, including ten for the slope model and retiming, and checks that MontenVélo is the default and an unknown bike is refused.
- **Not verified:** the Linux Docker image with the tiles (it builds in CI), and the speeds against real rides: the effort levels are estimates.

## Le Fayet platforms, walking slopes and bike profiles · 20 November 2026

- **Le Fayet island platforms:** walks and MontenVélo searches from the platforms between the tracks found nothing, or a fake 2–24 m walk. Their only public way off is the underpass, whose landing OSM tags as −0.5 on the lower flight (way 255390152) and −1 on the two upper ones (255390162, 255390166); MOTIS will not change level there. `scripts/clean_osm.py` now sets the upper flights to `-0.5;0` while OSM still has `-1;0`. After re-importing, a walk from the platform to the MontenVélo station takes 213 m through the underpass (levels 0 → −1 → −0.5 → 0).
- **Still failing:** MontenVélo from the same platforms. Rental routing in MOTIS 2.11.4 (the latest release) finds nothing wherever the walk to a station changes level, while routes from the station corridor, main platform and Place de la Gare work.
- **Reachability check:** `npm run reachability` walks from each of the 1,131 map points to its three nearest neighbours 150 m–1.5 km away. Before the fix it flagged only the three platform spots passed as arguments (the map's own points all passed); after it, none.
- **Walking times** now follow the slope (MOTIS was 1.2 m/s everywhere):

  | Walk | MOTIS | Now | Climb |
  | --- | --- | --- | --- |
  | Le Fayet → Saint-Gervais | 32 min | 48 min | ↗ 231 m |
  | Saint-Gervais → Le Fayet | 32 min | 36 min | ↘ 231 m |
  | Chamonix → Les Praz | 50 min | 53 min | ↗ 54 m ↘ 17 m |
  | Sallanches station → centre | 15 min | 15 min | ↗ 4 m ↘ 14 m |
  | Passy chef-lieu → Lac de Passy | 51 min | 57 min | ↗ 70 m ↘ 152 m |

- **Height grid:** 1,027 × 577 points, 1.2 MB, built in 1.5 s; Le Fayet station 583 m, Chamonix 1,041 m, Mont Blanc 4,791 m, matching the source tiles.
- **Bike profile:** Le Fayet → Plateau d’Assy shows "583 m → 1 244 m" over 8,2 km; the crosshair follows the mouse ("6,6 km · 990 m" at 80 %), resets when the pointer leaves, and steps 200 m per arrow key. The line colour passes the dataviz palette check on both surfaces (`#15876c` light, `#3aa982` dark). Checked at desktop size and 375×812, light and dark, with no horizontal overflow; walking legs show their climb without a chart.
- Thirty-nine API tests pass, including walking speed, walk retiming from a synthetic grid, bike profiles and grid parsing.

## Second design review · 20 November 2026

Checked in the browser against the live API at 1440×900 and 390×844 (touch), in light and dark themes, with no page errors.

- **Frequent services:** journeys that take the same lines between the same stops with the same timings, at most 5 minutes apart and evenly spaced, share one card with a "Toutes les minutes" badge (`src/frequent.ts`). Le Fayet → Saint-Gervais at 09:00 went from 19 cards, one per Valléen minute, to 12. The near and far ways to catch the same Y85 stay separate cards. Five new tests cover folding, separate paths, irregular gaps, ordering and cancellations.
- **Results list:** cards start collapsed and the first one is drawn on the map. A click opens a card; a second click closes it and keeps it on the map. Opening the fourth card while the first was open kept the fourth card in place, then scrolled it up under the search line to show its timeline. A sticky line above the results repeats the search ("Passy Chef-lieu → Gare de Sallanches · sam. 21 nov., 08:00"); **Modifier** scrolls back to the form.
- **Map taps:** while a trip is shown, points within 40 m of its stops, stations and ends keep their colour and the others fade; all of them still open. On a phone, a map tap with the sheet up only lowers it, so the tap that used to open the faded "Mont Blanc" stop now gives the map back. With the sheet down, a tap on that stop opens its card with the trip kept behind **Retour aux trajets**. On desktop a faded stop opens directly.
- **Map controls:** the compact attribution starts folded behind its button on every screen, and touch screens get no zoom buttons. In the dark theme the attribution text and button are legible.
- **Place cards:** one row of actions (Y aller, Partir d’ici); "Voir le service" moved next to the data source, and the Montenbus booking link and phone number moved into "Avant de réserver". Labels are singular ("Gare", "Arrêt de bus · Passy"). Departures more than an hour away lead with the clock time ("08:41 · sam. 21 nov."). Nearby stops show where their next buses go ("vers Sallanches - Zone Commerciale de Warens"). On a phone the card loses its frame, so the next departure fits a half sheet.
- **Height charts:** a ride climbing less than 30 m has no chart; Passy → Sallanches by MontenVélo (↗ 27 m over 7.2 km) shows none, Le Fayet → Plateau d’Assy keeps its chart.
- **Settings and notes:** the bike types have their own icons (lightning, bike, key) and "Durée la plus courte" a stopwatch. The data notes no longer mention MOTIS, GTFS or feed details.
- `npm run build` passes; 44 API and frontend tests pass.

## Lift stations · 20 November 2026

- The routing model already ran both lifts in both directions: Saint-Gervais → Gare du Fayet at 09:00 takes the Valléen down in 7 minutes. The map only had a point at each lift's lower station.
- `scripts/prepare.py` now adds a point at each station: Le Valléen — Le Fayet and — Saint-Gervais, Ascenseur des Thermes — Les Thermes and — Saint-Gervais, each noting the direction it serves ("Vers Le Fayet · 07:00–20:30 · trajet 5 min"). The lower stations keep their ids (`valleen`, `thermal_lift`) so older shared links still open them; the upper ones are `valleen-haut` and `thermal_lift-haut`. The thermal lift's upper routing stop reads "Saint-Gervais" instead of repeating the lift's name.
- `prepare.py --no-import` changed only those four points in `valley.json`. In the browser, the upper Valléen card opens, **Partir d’ici** fills the departure, and a downhill trip keeps the upper station in colour on the map. The local routing graph picks up the new stop name after `npm run setup`; the deployed image imports it on the next deploy.

## Resort shuttles in routing · 21 November 2026

- **Feeds:** the Pysae groups `les-contamines`, `meg-bus`, `combloux` and `praz` are imported with their live feeds, next to Facilibus and Chamonix. Only Les Contamines has a current season (winter 2026–27, 12 December to 11 April); the other three still carry their summer 2026 services, and Facilibus's autumn service ends on 18 December.
- **Private routes:** the import drops the routes Pysae's network list marks private or deactivated. The trip-name filter alone kept Meg-Bus's 56 "Form" training trips and Praz's 28 "Praz Formation" ones; with the list, Meg-Bus imports 106 trips and Praz 56. No Chamonix or Facilibus route currently imported is on the list.
- **Routing**, on a local import: Le Pont des Crouets → Notre-Dame de la Gorge on 20 December rides the Contamines line 1 and express, or the hamlets line; the same search today, before the season, falls back to the Y84 coach. Le Fayet → Saint-Nicolas-de-Véroce still uses Facilibus L1.
- **Map:** the **Navettes** layer is now built from the imported feeds (161 stops: Meg-Bus 49, Facilibus 43, Contamines 30, Combloux 26, Praz 13) and shown by default; the bus layer drops from 515 to 472 stops, the Facilibus ones having moved. Shuttle cards read "Arrêt de navette · Les Contamines-Montjoie" and show departure boards; Chef-lieu lists the first winter departures from 08:15 on 12 December. Shuttle legs get a free-fare hint, and a loop line that publishes no headsign no longer reads "vers" the stop it leaves from.
- `npm test` (45 tests), `npm run build`, `npm run smoke` and `npm run reachability` (1,162 points, none cut off from walking) pass against the local import.
- **Weekly rebuild:** timetables are baked into the image, so the build-and-deploy workflow now also runs every Saturday at 02:41 UTC. Facilibus's winter service and the Meg-Bus, Combloux and Praz winter seasons reach the routes at the first Saturday run after they are published. The schedule was checked by parsing the workflow, not by a scheduled run.

## Deselecting a journey · 23 November 2026

- **Results list:** closing the open card now also deselects it, replacing the 20 November behaviour that kept it on the map. Its route and the A and B markers leave the map, every stop gets its colour back, and the map and the card stay where they were. The first card still starts selected and collapsed, so it takes one click to open and a second to clear. Opening another card, changing the priority or a new search selects a journey again; **Plus tard** with nothing selected added eight cards and selected none.
- **Phone:** with results listed and none selected, the lowered sheet reads "Gare de Chedde → Gare de Sallanches · 8 possibilités" instead of "Où allez-vous ?", and a tap raises it to the results.
- Checked in the browser at desktop size and 375×812 with no page errors; `npm run build` and `npm test` pass.
