# ValléeMapper development and deployment

[Back to the project overview](../README.md)

The app uses React, TypeScript and MapLibre, with native MOTIS 2.11.4 for routing.

## Run locally

For a fresh checkout, use Node 22.12+ and Python 3.11+ on macOS Apple Silicon or Linux x86_64:

```sh
npm ci
npm run setup
npm run dev
```

Open [the local app](http://127.0.0.1:5173). The development command starts MOTIS on 8080, the API on 8787 and Vite on 5173. Ctrl-C stops all three. Set `MOTIS_URL` to use an existing routing server.

## Refresh data

Stop the app before rebuilding the graph. `npm run data:refresh` downloads fresh **GTFS and OSM inputs**, cleans the map extract, rebuilds the lift model and imports the graph. Update fares, lift opening rules, shared-mobility locations and seasonal shuttle calendars separately. The observations in `docs/research/data/` date from **18 November 2026**.

The setup script downloads the official executable and verifies its SHA256. It creates a project-local Python venv for `osmium==4.3.0`, so there is no system Python package installation. The OSM source is the roughly 91 MB Haute-Savoie extract from [OpenStreetMap France](https://download.openstreetmap.fr/extracts/europe/france/rhone_alpes/). It is cropped with complete local ways to `[6.48,45.70,7.05,46.02]`, omitting invalid and empty ways to avoid a geocoder import failure. Selected GTFS trips keep their original identifiers, full stop sequences, calendars, shapes and transfers. This lets the matching realtime feeds continue to work.

Raw inputs, checksums, cleaned-map report, native executable and imported graph live in ignored `var/`. `python3 scripts/build_transit_locations.py` regenerates bus/train map points from imported feeds. Setup runs this command during data preparation. Public map data lives in `public/data/valley.json`. Run setup on each machine to generate a compatible graph.

## Cloudflare

The included architecture is **Worker + static assets → one shared Durable Object → MOTIS Container**. The same request validation and API adapter run locally and in the Worker.

`wrangler.jsonc` uses the native Durable Object Container API and one fixed router ID. The Linux/amd64 Docker image downloads the checksum-pinned executable and imports the graph **inside the image** from prepared inputs. Graph files ship with the image and survive instance replacement. Refreshing the static feeds requires rebuilding the image.

### Deploy with GitHub Actions

Pushes to `main` deploy to Cloudflare once the tests, site build and Linux MOTIS startup check pass. Pull requests run those checks for review. The workflow waits for the deployed router to respond and prints the app URL.

For the first deploy, set up a Cloudflare account with Workers Paid and an active `workers.dev` subdomain. Add the following [repository Actions secrets](https://github.com/mathieudutour/valleemapper/settings/secrets/actions).

- `CLOUDFLARE_ACCOUNT_ID` is the target account ID.
- `CLOUDFLARE_API_TOKEN` is an [account API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) created under **Manage Account → API Tokens**. Use **Workers Admin** at the Workers product scope for the first deploy and grant write access to **Containers**. Scope the token to the account hosting ValléeMapper. Once the Worker exists, the Workers permission can be narrowed to **Editor** on `valleemapper`. See [Cloudflare’s Workers roles](https://developers.cloudflare.com/workers/authorization/workers/) and [Containers permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/).

To redeploy on demand or publish fresh static timetables, open [Actions → Build and deploy](https://github.com/mathieudutour/valleemapper/actions/workflows/build-deploy.yml) and choose **Run workflow** on `main`. The new image takes effect when the container next starts. The container uses `standard-2`, connects to the live feeds and sleeps after ten minutes of inactivity.

### Deploy from a local machine

For a local deployment, start Docker Desktop and run the commands below. On a fresh checkout, run setup first.

```sh
npx wrangler login
npm run build && npx wrangler deploy
```

`npm run cloudflare:check` validates the Worker configuration and assets in a dry run. The train and Valléen smoke tests also run against a live deployment by setting `APP_URL` to the deployed URL.

## Validation

```sh
npm run build       # frontend + local API + Worker types, then production bundle
npm test            # address, routing and preference regressions
npm run smoke       # requires npm run dev in another terminal
npm run cloudflare:check
```

The smoke tests cover rail and Valléen journeys, leg geometry and input validation. See [test results](validation.md) for manual checks of routing, address search, mobile layout and map layers.

## Routing and data notes

- Address search uses the IGN/Base Adresse Nationale geocoder. Stop and place search uses the MOTIS index. Realtime updates are configured for matching SNCF, Chamonix and Facilibus feeds.
- To find lower-walking options, the API tries five-minute walking limits at each end independently and at both ends together. It gives the optional searches up to 350 ms after the main results are ready.
- The Valléen and thermal lift model uses published ride durations and opening hours with a one-minute frequency assumption. It excludes known closures, including the thermal lift's first Monday of each month. The model expires after 120 days or on 31 March 2027, whichever is earlier.
- SNCF publishes no shapes, so the import sets `timetable.route_shapes: missing` and MOTIS matches those routes onto OSM tracks. A leg that still only joins its stops is drawn dashed and labelled as an approximate path. The prototype covers published fare hints and selected reservations. Accessibility, gradients, bicycle carriage, disruptions, and fare entitlements still need validation.
- The [data inventory](research/passy-transport-data.md), [shuttles, lifts and fares](research/shuttles-lifts-fares.md), [stack and hosting research](research/transport-stack.md), [MOTIS API contract](research/motis-api.md) and [source and licence inventory](research/data/sources.json) record assumptions and provenance. Some resort, Montenbus and lift API reuse terms remain unverified.
