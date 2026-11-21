# Resort shuttles, vertical links and fares

Follow-up research checked **18 November 2026**, for the ten Pays du Mont-Blanc communes and relevant Chamonix connections. This supplements [the main transport inventory](passy-transport-data.md). Publicly readable endpoints, declared reuse licences, service calendars and purchasable fare quotes are separate properties.

## Findings that change the feasibility assessment

- **Facilibus has a current machine-readable timetable and matching live departures.** Other resort feeds exist, but several currently contain expired summer data or empty off-season files.
- **The Valléen has public structured operating data**, including hours, ride duration and status; its two terminals and the thermal lift are mapped in OpenStreetMap.
- **Basic fares can be represented with curated rules.** Checked bus/rail timetable feeds contain no fares, and the bike/car price feeds have omissions or defects.
- **The Chamonix live-data mismatch is resolved:** use Pysae's published GTFS alongside its live feed. All 237 previously sampled trip updates match that timetable. The original catalogue ZIP uses different identifiers.

Sources: [Pysae documentation](https://api.pysae.com/api/docs/v4/public/redoc), [published Chamonix GTFS](https://api.pysae.com/api/v4/groups/chamonix-bus/gtfs/pub), [Valléen operator](https://www.ski-saintgervais.com/fr/tarifs-valleen), [saved evidence](data/followup-inspection.json).

## Resort and municipal shuttles

Pysae documents anonymous downloads of published/shared GTFS. These URLs return the actual timetable ZIP and live protobuf, respectively:

```text
https://api.pysae.com/api/v4/groups/{group}/gtfs/pub
https://api.pysae.com/api/v4/groups/{group}/gtfs-rt
```

The [public network list](https://api.pysae.com/api/v4/pub-groups?feature=display_info) supplies group metadata, including private/deactivated routes. Filter those out. No explicit local reuse licence was verified for the direct shuttle exports; technical access is confirmed, while production reuse terms should be clarified with the authority/operator. [API documentation](https://api.pysae.com/api/docs/site/en/public/python/).

| Network / Pysae group | Downloaded public service | Served public stops | Situation on research date |
|---|---|---:|---|
| Saint-Gervais Facilibus / `saint-gervais` | L1 Saint-Nicolas and L2 Les Pratz; **31 Aug–18 Dec 2026** | 43 | Current; all **50 sampled live trip updates match** |
| Megève Meg-Bus / `meg-bus` | Two public summer lines; **4 Jul–30 Aug 2026** | 49 | Expired summer timetable; live sample empty |
| Combloux / `combloux` | Summer shuttle; **4 Jul–30 Aug 2026** | 26 | Expired summer timetable; live sample empty |
| Praz-sur-Arly / `praz` | Public summer route; **3 Jul–28 Aug 2026** | 13 | Expired summer timetable; live sample empty |

The table counts stops used by public routes, rather than every stop stored in the files. For example, Facilibus has 63 stop records but only 43 served by its two routes. Megève and Praz include private training routes. [Inspected feed manifest](data/shuttle-feeds-research.json), [131-stop research export](data/resort-shuttle-stops-research.geojson).

All four are described as free services by their official local pages: [Saint-Gervais](https://www.saintgervais.com/mairie/actualites/navettes-facilibus-passage-aux-horaires-d-automne-a-partir-du-31-aout-2026/), [Megève](https://www.megeve-tourisme.fr/informations-pratiques/acces-et-mobilite/navettes/), [Combloux](https://www.combloux.com/sejourner/transports-mobilites-douces-combloux/se-deplacer-a-combloux/navette-station-combloux/), [Praz](https://www.prazsurarly.com/fr/navettes-station).

### Exact timetable documents and other networks

| Area | Useful official data/document | Limitations and seasonal details |
|---|---|---|
| **Saint-Gervais** | [Autumn 2026 PDF](https://www.saintgervais.com/app/uploads/saint-gervais/2026/08/Saint-Gervais-Mont-Blanc_Depliant-Facilibus-Automne-2026.pdf) | Two free routes, connections to the Valléen and thermal lift; the current GTFS avoids manual transcription |
| **Megève** | [Summer 2026 PDF](https://www.megeve-tourisme.fr/app/uploads/2026/06/horaire-megbus-du-04-07-2026-au-30-08-2026-v5.pdf); [2025–26 full winter PDF](https://mairie.megeve.fr/wp-content/uploads/2026/02/Fiche-Megbus-2025-2026.pdf) | Official listing announces **12 Dec 2026–18 Apr 2027**, but detailed next-winter timetable was not verified. The timetable page's other winter link actually covers only **30 Mar–6 Apr 2026** |
| **Combloux** | [Winter 2025–26 plan](https://sedeplacer.ccpmb.fr/wp-content/uploads/2026/02/CCPMB_plans-navettes__Combloux-1.pdf) | Village–La Cry in winter, village–Cuchet in summer. Generic rotation claims are not a dated 2026–27 schedule |
| **Praz-sur-Arly** | [Summer 2026 PDF](https://www.prazsurarly.com/sites/default/files/2026-06/Horaires%20navette%20ete%202026.pdf); [winter 2025–26 PDF](https://www.prazsurarly.com/sites/default/files/2025-12/SKI%20BUS%20HIVER%2025%20-26.pdf) | Free service. Winter document covers **20 Dec 2025–27 Mar 2026**; precise stop changes and next-season publication matter |
| **Les Contamines** | [Official shuttle page](https://www.lescontamines.com/hiver/pratique/acces-et-se-deplacer/navettes); [summer 2026 PDF](https://www.lescontamines.com/sites/lescontamines/files/content/files/fh-contamines-ete2026_0.pdf); [winter 2025–26 PDF](https://www.lescontamines.com/sites/lescontamines/files/content/files/fh-contamines-hiver2025-2026-web.pdf) | Free Transdev Montblanc Bus services. Zenbus endpoints work, but current **1 Sep–13 Dec 2026** feed has **zero routes/stops/trips**. Winter historical schedules run into April with holiday-specific service |
| **Sallanches** | [Official page](https://www.sallanchesmontblanc.com/navette-estivale-gratuite); [dated 2026 PDF](https://static.apidae-tourisme.com/filestore/objets-touristiques/documents/166/241/41808294/Affiche+navette+estivale.pdf) | Free **4 Jul–30 Aug 2026** circuit, 16 stops, **45-minute** rotations. Pré de Foire omitted Saturday market mornings; older material says 30 minutes |
| **Cordon** | [Municipality](https://mairie.cordon.fr/page/navette-saisonniere); [older winter plan](https://sedeplacer.ccpmb.fr/wp-content/uploads/2026/02/CCPMB_plans-navettes__Cordon-1.pdf) | Free winter loop linked to ski-area operation. The Pysae group labelled CORDON (`autocars-borini`) currently downloads unrelated **Évian/Publier golf-event** data: reject it |
| **Passy Lac Vert** | [Official dated 2026 service](https://www.passy-mont-blanc.com/en/sejourner/se-deplacer-a-passy-mont-blanc/) | Free shuttle from Plaine-Joux every 15 minutes; **20 Jun–13 Sep**, with date-dependent days/hours and lunch gaps. Separate from paid Y85. No dedicated GTFS/live feed verified |
| **Domancy / Demi-Quartier** | Regional buses, Montenbus and neighbouring networks in the main inventory | No separate commune-specific shuttle network established by the checked sources; this is not proof that no service exists |

**Update, 21 November 2026:** Pysae also hosts a `les-contamines` group (Transdev), which this survey missed. It already publishes the **winter 2026–27** service, **12 Dec 2026–11 Apr 2027**, with four public routes and no private ones, while the Zenbus feed below is still empty. Meg-Bus, Combloux and Praz still carry only their expired summer 2026 services, and Facilibus's autumn service ends on **18 Dec 2026**. All five Pysae shuttle networks are now imported for routing.

Do not shift old winter dates by a year. The [Meg-Bus service listing](https://www.megeve-tourisme.fr/commerce-service/navettes-meg-bus/) demonstrates why: it has next-season opening dates while the downloadable detailed schedules still refer to the previous season.

Contamines' actual anonymous feed URLs are:

```text
https://zenbus.net/gtfs/static/download.zip?dataset=contamines
https://zenbus.net/gtfs/rt/poll.proto?dataset=contamines
```

An HTTP success with an empty off-season file supplies no passenger departures. [Zenbus feed documentation](https://zenbus.fr/files/Documentation%20-%20Zenbus%20-%20GTFS-RT.pdf).

### Sallanches has convertible GIS data

The town's [official map](https://ville-sallanches.maps.arcgis.com/apps/instant/minimalist/index.html?appid=a60c4a5a1b634ce38e270f5c715ef79c) exposes **16 stop points**, including departure strings in `Hd0...Hd20`, and **154 route segments**:

```text
https://services2.arcgis.com/wCCJgOJ77NBdYbmT/arcgis/rest/services/Arrets_navette2024/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson
https://services2.arcgis.com/wCCJgOJ77NBdYbmT/arcgis/rest/services/Circuit_navette/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson
```

The layer still names 2024 and has null licence metadata, while the linked service page/PDF describe 2026. Compare stop times against the dated PDF before conversion to GTFS and clarify reuse terms with the town. [Saved stops](data/sallanches-summer-stops-research.geojson), [saved route](data/sallanches-summer-route-research.geojson).

## Valléen and thermal lift

| Link | Regular operation | Ride | Published ordinary fare |
|---|---|---|---:|
| **Le Valléen** | Daily **07:00–20:30**, except closures | Le Fayet station–Le Châtelet, about **5 min** | **€2.50 one way**, €5 for two passages |
| **Ascenseur des Thermes** | Daily **06:00–23:30**, except closures | Parc Thermal–Saint-Gervais, about **3 min** | **Free** |

Sources: [Valléen operator](https://www.ski-saintgervais.com/fr/tarifs-valleen), [thermal-lift listing](https://www.saintgervais.com/jai-envie/activites/ascenseur-des-thermes-saint-gervais-les-bains-fr-5130287/), [thermal-lift ride duration](https://www.saintgervais.com/app/uploads/saint-gervais/2024/09/Press-Pack-Winter-24-25.pdf), [2026 operating brochure](https://www.saintgervais.com/app/uploads/saint-gervais/2026/08/Saint-Gervais-Mont-Blanc_Depliant-Facilibus-Automne-2026.pdf). Both accept bikes according to the brochure; the thermal lift is listed as wheelchair accessible. Walking access still needs routing checks.

### Public structured Valléen data found

Following the lift operator's [interactive map](https://lumiplay.link/interactive-map/evasion-mont-blanc-saint-gervais/fr) reveals these public GET endpoints, tested without a key:

```text
https://public.lumiplay.link/interactive-map/v1/map/name/evasion-mont-blanc-saint-gervais
https://public.lumiplay.link/interactive-map/v1/map/19564192-c5ad-45be-a4ca-bbaba136d0bd/staticPoiData?lang=fr
https://public.lumiplay.link/interactive-map/v1/map/19564192-c5ad-45be-a4ca-bbaba136d0bd/dynamicPoiData?lang=fr
```

Join on **ID 70821**, `LE VALLEEN`. Static fields include theoretical hours, duration **5**, departure/arrival altitude and capacity. Dynamic fields include `openingStatus`; the sampled value was `FORECAST`, with `operating=true`. Neither value alone means the service is open at the time of a future journey. No timestamp on this individual record, documented public integration contract or reuse licence was established. Lumiplan explicitly offers an API/SDK for third-party integration, so this is a concrete supplier integration route. [Provider](https://www.lumiplan.com/smart-tourism-ski/ds-plan-des-pistes), [saved targeted records](data/vertical-links.json).

The thermal lift was **absent from that map's static JSON**. It does appear in the [public Lumiplan HTML bulletin](https://bulletinv3.lumiplan.pro/bulletin.php?isSoir=false&lang=fr&station=saint-gervais), with operating hours and a status icon. The bulletin is a readable fallback, not a verified standard transit API for that lift.

OpenStreetMap supplies the line geometry and both terminals for each link. The [Valléen way](https://www.openstreetmap.org/way/1160485041) and [thermal-lift way](https://www.openstreetmap.org/way/1230812180) were downloaded and exported as two lines plus four terminal points in [GeoJSON](data/vertical-links-osm.geojson). This is mapped geometry rather than an on-site survey or a tested pedestrian graph; preserve [OSM attribution and ODbL](https://www.openstreetmap.org/copyright).

### Closures and pass eligibility are essential

The Valléen's recent maintenance window was **2–15 November 2026**, with reopening scheduled for 16 November. The later municipal notice places the thermal lift's maintenance at **2–6 November**, reopening at 17:00 on the 6th. This overrides an older tourism alert saying only 2–4 November. Its listing also announces maintenance on the **first Monday of each month through at least March 2027**. Keep these as dated exceptions, not perpetual annual closures. [Valléen notice](https://www.saintgervais.com/mairie/actualites/telecabine-le-valleen-une-maintenance-prevue-du-2-au-15-novembre-inclus/), [thermal notice](https://www.saintgervais.com/mairie/actualites/ascenseur-des-thermes-une-maintenance-semestrielle-prevue-du-2-au-6-novembre-2026-inclus/), [listing](https://www.saintgervais.com/jai-envie/activites/ascenseur-des-thermes-saint-gervais-les-bains-fr-5130287/).

Valléen products: 12 passages **€25 / €22.50 reduced**, 7 days **€25 / €22.50**, 30 days **€60 / €54**, annual **€240 / €216**. Under-5s ride free with a paying adult and proof of age. Reduced multipassage/pass eligibility covers ages 5–14, 65+, disability and qualifying groups. [Operator tariff](https://www.ski-saintgervais.com/fr/tarifs-valleen).

The **Pass SaintG'air** makes journeys free for approved permanent Saint-Gervais residents, defined as living there more than eight months a year. The current edition runs **18 August 2026–15 September 2027**. Eligible school passes also confer access; residence elsewhere in CCPMB alone does not. New/replacement pass media can cost €2. [Eligibility](https://www.saintgervais.com/mairie/au-quotidien/transports-mobilite/pass-saintgair/), [2026–27 renewal](https://www.saintgervais.com/mairie/actualites/la-commune-de-saint-gervais-reconduit-l-operation-pour-l-annee-2026-2027/).

## Fares for a journey planner

Direct inspection found **no fare files** in the regional, Chamonix or SNCF GTFS. The Haute-Savoie NeTEx archive also lacked fare/tariff frames. NeTEx publication therefore does not solve pricing here. [Inspection evidence](data/followup-inspection.json), [research fare rules](data/fare-rules-research.json).

| Mode | Verified published prices/rules | Consequence for integration |
|---|---|---|
| **Y81–Y86** | Effective **1 Mar 2026**: single **€1.70**, 10 journeys **€13.50**, 30 days **€33**; reduced single **€0.80** | Curate the dated flat-fare products and eligibility; older tourism copy saying €1.60 is superseded |
| **274** | For Sallanches–Geneva: **€11.40 route only**, **€14.60 with Geneva zone 10**; current sheet **31 Aug–12 Dec 2026** | Separate OD/zone matrix; do not apply Y85's flat fare |
| **Chamonix bus** | From **1 Jul 2026**: daytime single **€1.70 online/kiosk**, **€2.20 agency/onboard card**, **€2.70 cash**; day **€5**, week **€19** | Store purchase channel, media fees and night-service eligibility |
| **Montenbus** | **€40/year**, **€20/30 days**, reduced **€10/year**, with eligible free memberships | Membership acquisition cost differs from the additional cost of one booked trip |
| **MontenVélo** | Non-subscriber first 30 min **€0.50**; members first 30 min included. Membership **€6/month or €30/year**, reduced **€3/€15** | GBFS has only pay-as-you-go pricing; subscriptions need separate rules |
| **Citiz** | Small-car example: **€5/h + €0.44/km** without subscription; **€3/h + €0.44/km** with **€16/month** subscription, before Dec change | Reservation time, category, night periods, caps and distance tiers prevent a simple travel-time calculation |
| **Local TER / Mont-Blanc Express** | No verified current open OD price matrix or supported purchase-quote API for Chedde/Le Fayet/Sallanches | Keep price unknown or use a provider handoff until backed by an authoritative source |

Sources: [Y81–Y86 tariff PDF](https://storage.googleapis.com/is-wp-170-prod/uploads-prod/2026/08/cars_region_haute_savoie_tarifs_MAJ-septembre_2026_Y13-03-04-81-82-83-84-85-86-91-92-93-94.pdf), [274 PDF](https://storage.googleapis.com/is-wp-170-prod/uploads-prod/2026/08/cars_region_haute_savoie_horaires_274_rentree_2026-nouvel-horaire.pdf), [Chamonix fare PDF](https://www.chamonix.com/sites/default/files/media/brochures/Tarifs-Cham-Ete2026.pdf), [Montenbus regulation](https://www.montenbus.fr/reglement-montenbus/), [bike subscriptions](https://montenvelo.zendesk.com/hc/en-us/articles/21300567054236-Subscriptions), [Citiz tariffs](https://aura.citiz.coop/tarifs/).

### Rules that change the apparent cheapest journey

**Chamonix guest cards do not make buses universally free.** They enable discounted bus passes, which must be acquired separately; the discount does not apply to ordinary singles/night services. Valid eligible lift passes have their own bus entitlements. A guest-card weekly bus product is **€10**, compared with the normal **€19**; include the user's actual product. [Guest-card instructions](https://www.chamonix.com/infos-et-services/la-carte-d-hote), [dated tariff](https://www.chamonix.com/sites/default/files/media/brochures/Tarifs-Cham-Ete2026.pdf).

**Free guest-card/ViaCham rail journeys must be wholly within Servoz–Vallorcine.** Chedde and Le Fayet are outside that area. The official flyer requires a ticket for the **whole journey** when travelling through from outside the perimeter, rather than simply pricing the uncovered section. [2026 flyer](https://www.chamonix.com/sites/default/files/media/brochures/AFFICHE%20PDF%20INFOS%20ETE%202026%20A4.pdf).

**Bike price feeds are incomplete.** MontenVélo's GBFS includes one pay-as-you-go plan but no subscription products. The official site and help disagree on subscriber prices beyond four hours; avoid quoting that range until clarified. The €25 card preauthorisation is not a fare. [GBFS pricing](https://gbfs.partners.fifteen.eu/gbfs/2.2/mont_blanc/en/system_pricing_plans.json), [official table](https://montenvelo.fr/home-2/abonnements-tarifs/), [subscription help](https://montenvelo.zendesk.com/hc/en-us/articles/21300567054236-Subscriptions).

**Citiz price feeds contain a material defect.** The checked S/M/L subscription plans publish zero time charges, contradicting official hourly rates. Moreover, a **€0.02/km increase applies from 1 December 2026**, based on rental start date even for bookings made earlier. Do not show free rentals or lock in today's kilometre rates for December. [Actual GBFS pricing](https://backend.citiz.fr/public/provider/5/gbfs/v3.0/system_pricing_plans.json), [dated change notice](https://aura.citiz.coop/2026/11/11/evolution-des-tarifs-kilometriques-au-1er-decembre-2026/).

No complete supported public cross-mode fare or live purchase-quote API was verified. A practical first fare model stores traveller entitlements, service date, purchase channel, source/effective dates, additional trip cost, required membership purchase and unknown prices separately. Public price tables support sourced estimates; they do not authorize ticket sales.

## Data supplied and remaining integration work

- [Shuttle feed inventory and direct audits](data/shuttle-feeds-research.json), including valid/expired/rejected sources.
- [131 public-route shuttle stops](data/resort-shuttle-stops-research.geojson); historical summer points remain explicitly labelled.
- [Sallanches stops](data/sallanches-summer-stops-research.geojson) and [route](data/sallanches-summer-route-research.geojson), with the 2024/2026 reconciliation caveat above.
- [Vertical operating records](data/vertical-links.json) and [OSM lines/terminals](data/vertical-links-osm.geojson).
- [Curated fare research seed](data/fare-rules-research.json), with sources and conditions; this is not a complete fare engine.
- [Follow-up inspection evidence](data/followup-inspection.json), including the resolved Chamonix match.

The most useful immediate additions are current Facilibus, the matching Chamonix timetable, and the two vertical links. Monitor the other resort feed URLs for next-season publication, obtain reuse terms for the direct operator feeds, and validate walking connections before promising end-to-end arrival times.
