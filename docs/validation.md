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
