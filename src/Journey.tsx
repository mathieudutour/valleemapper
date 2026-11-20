import React from "react";
import {
  Bike,
  BusFront,
  CableCar,
  ChevronDown,
  ChevronRight,
  Footprints,
  Info,
  TrainFront,
  TriangleAlert,
} from "lucide-react";
import {
  hasApproximatePath,
  modeLabel,
  type Itinerary,
  type Leg,
  type MotisAlert,
} from "./types";
import { duration, tidyText, time } from "./format";
import { stopName } from "./places";
import { formatDistance, instructions } from "./directions";

const RAIL = /RAIL|TRAM|SUBURBAN/;
export function ModeIcon({ mode, size = 18 }: { mode: string; size?: number }) {
  const C =
    mode === "WALK"
      ? Footprints
      : mode === "BIKE" || mode === "RENTAL"
        ? Bike
        : mode === "AERIAL_LIFT" || mode === "FUNICULAR"
          ? CableCar
          : RAIL.test(mode)
            ? TrainFront
            : BusFront;
  return <C size={size} strokeWidth={1.8} aria-hidden="true" />;
}

const isLift = (l: Leg) => l.routeId?.startsWith("vertical_");
const legLabel = (l: Leg) => l.routeShortName || modeLabel[l.mode] || l.mode;
const isStreet = (l: Leg) =>
  l.mode === "WALK" || l.mode === "BIKE" || l.mode === "RENTAL";

/** Minutes a realtime update moved the departure; 0 when on time or unknown. */
export const delayMinutes = (l: Leg) =>
  l.realTime && l.scheduledStartTime
    ? Math.round(
        (Date.parse(l.startTime) - Date.parse(l.scheduledStartTime)) / 60_000,
      )
    : 0;
/** Alerts on the leg and its boarding and alighting stops, once each. */
export function legAlerts(l: Leg): MotisAlert[] {
  const seen = new Map<string, MotisAlert>();
  for (const a of [
    ...(l.alerts ?? []),
    ...(l.from.alerts ?? []),
    ...(l.to.alerts ?? []),
  ])
    if (a.headerText) seen.set(a.headerText + a.descriptionText, a);
  return [...seen.values()];
}
export const isCancelled = (item: Itinerary) =>
  item.legs.some((l) => l.cancelled);

function Alerts({ alerts }: { alerts: MotisAlert[] }) {
  return alerts.map((a) => (
    <details className="alert" key={a.headerText + a.descriptionText}>
      <summary>
        <TriangleAlert size={15} aria-hidden="true" />
        {tidyText(a.headerText)}
      </summary>
      {a.descriptionText &&
        tidyText(a.descriptionText) !== tidyText(a.headerText) && (
          <p>{tidyText(a.descriptionText)}</p>
        )}
      {a.url && (
        <a href={a.url} target="_blank" rel="noreferrer">
          En savoir plus
        </a>
      )}
    </details>
  ));
}

function Directions({ leg }: { leg: Leg }) {
  const steps = leg.steps?.length ? instructions(leg.steps) : [];
  if (steps.length < 2) return null;
  return (
    <details className="directions">
      <summary>
        Itinéraire {leg.mode === "WALK" ? "à pied" : "à vélo"} · {steps.length}{" "}
        étapes
      </summary>
      <ol>
        {steps.map((s, i) => (
          <li key={i}>
            <span>{s.text}</span>
            <small>{formatDistance(s.distance)}</small>
          </li>
        ))}
        <li>
          <span>Arrivée : {stopName(leg.to)}</span>
        </li>
      </ol>
    </details>
  );
}

function fares(legs: Leg[]) {
  const f = new Set<string>();
  for (const l of legs) {
    if (
      l.routeId?.startsWith("region_") &&
      /^Y8[1-6]$/.test(l.routeShortName || "")
    )
      f.add("Cars Région : 1,70 € le billet simple");
    if (l.routeId?.startsWith("chamonix_"))
      f.add("Chamonix : dès 1,70 € selon le canal d’achat");
    if (l.routeId?.includes("vertical_valleen"))
      f.add("Valléen : 2,50 € le trajet, hors gratuités");
    if (l.routeId?.includes("thermal_lift"))
      f.add("Ascenseur des Thermes : gratuit");
    if (RAIL.test(l.mode)) f.add("Train : tarif à vérifier auprès de SNCF");
    if (l.routeId?.startsWith("facilibus_")) f.add("Facilibus : gratuit");
  }
  return [...f];
}

export function JourneySummary({
  item,
  day,
}: {
  item: Itinerary;
  day?: string;
}) {
  const transit = item.legs.filter((l) => l.mode !== "WALK");
  return (
    <>
      <div className="journey-heading">
        <span className="journey-times">
          {day && <span className="day-chip">{day}</span>}
          {time(item.startTime)} <span aria-hidden="true">—</span>
          <span className="sr-only">à</span> {time(item.endTime)}
        </span>
        <strong>{duration(item.duration)}</strong>
      </div>
      <div className="mode-chain">
        {(transit.length ? item.legs : [item.legs[0]])
          .filter(
            (l) =>
              l.mode !== "WALK" || l.duration >= 180 || transit.length === 0,
          )
          .map((l, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <ChevronRight
                  size={13}
                  className="chain-chevron"
                  aria-hidden="true"
                />
              )}
              <span
                className={"mode-pill " + (l.mode === "WALK" ? "walk" : "")}
              >
                <ModeIcon mode={l.mode} size={16} />
                {legLabel(l)}
              </span>
            </React.Fragment>
          ))}
      </div>
    </>
  );
}

export function Journey({
  item,
  selected,
  onClick,
  lessWalking,
  day,
}: {
  item: Itinerary;
  lessWalking?: boolean;
  selected: boolean;
  onClick: () => void;
  day?: string;
}) {
  const transit = item.legs.filter((l) => l.mode !== "WALK"),
    walk = item.legs
      .filter((l) => l.mode === "WALK")
      .reduce((s, l) => s + l.duration, 0),
    lift = item.legs.some(isLift);
  const requiresReservation = item.legs.some(
    (leg) => leg.reservation === "COMPULSORY",
  );
  const fareHints = fares(item.legs);
  const rail = (l: Leg) => RAIL.test(l.mode);
  const cancelled = isCancelled(item);
  const delay = Math.max(0, ...item.legs.map(delayMinutes));
  const disrupted = item.legs.some(
    (l) => !isStreet(l) && legAlerts(l).length > 0,
  );
  return (
    <article
      className={
        "journey " +
        (selected ? "selected" : "") +
        (cancelled ? " cancelled" : "")
      }
    >
      <button
        className="journey-summary"
        onClick={onClick}
        aria-expanded={selected}
      >
        <JourneySummary item={item} day={day} />
        {(cancelled || delay >= 2 || disrupted) && (
          <div className="journey-badges">
            {cancelled && (
              <span className="disruption-badge">Trajet supprimé</span>
            )}
            {!cancelled && delay >= 2 && (
              <span className="disruption-badge">Retard +{delay} min</span>
            )}
            {disrupted && (
              <span className="disruption-badge">
                <TriangleAlert size={14} aria-hidden="true" /> Perturbation
              </span>
            )}
          </div>
        )}
        <div className="journey-meta">
          <span>
            {transit.length &&
            transit[0].mode !== "BIKE" &&
            transit[0].mode !== "RENTAL"
              ? `${item.transfers === 0 ? "Direct" : `${item.transfers} correspondance${item.transfers > 1 ? "s" : ""}`} · `
              : ""}
            {walk ? `${duration(walk)} à pied` : "Sans marche"}
          </span>
          {item.legs.some((l) => l.realTime) && (
            <span className="live-dot">Temps réel</span>
          )}
          {selected ? (
            <ChevronDown size={16} aria-hidden="true" />
          ) : (
            <ChevronRight size={16} aria-hidden="true" />
          )}
        </div>
        {(lessWalking || requiresReservation) && (
          <div className="journey-badges">
            {lessWalking && (
              <span className="walking-badge">
                <Footprints size={14} aria-hidden="true" />
                Moins de marche
              </span>
            )}
            {requiresReservation && (
              <span className="reservation-badge">
                <Info size={14} aria-hidden="true" /> Réservation obligatoire
              </span>
            )}
          </div>
        )}
        {lift && (
          <div className="estimate">
            Liaison verticale · heures de passage estimées
          </div>
        )}
      </button>
      {selected && (
        <div className="journey-detail">
          <ol className="timeline">
            {item.legs.map((l, i) => (
              <li
                className={"leg " + (l.mode === "WALK" ? "walking" : "")}
                key={i}
              >
                <div className="leg-time">
                  {delayMinutes(l) !== 0 && (
                    <del>
                      <span className="sr-only">prévu à </span>
                      {time(l.scheduledStartTime!)}
                    </del>
                  )}
                  {time(l.startTime)}
                </div>
                <div className="leg-track">
                  <ModeIcon mode={l.mode} size={16} />
                </div>
                <div className="leg-content">
                  <strong>
                    {i === 0 ? l.from.name : stopName(l.from, rail(l))}
                  </strong>
                  <div className="leg-description">
                    {l.mode === "WALK" ? (
                      <>
                        Marche · {duration(l.duration)}
                        {l.distance ? ` · ${formatDistance(l.distance)}` : ""}
                        <Directions leg={l} />
                      </>
                    ) : (
                      <>
                        <span className="route-tag">{legLabel(l)}</span>{" "}
                        {l.headsign &&
                          `vers ${/^\d+$/.test(l.headsign) ? stopName(l.to, rail(l)) : stopName({ name: l.headsign }, false)}`}
                        <span className="leg-facts">
                          {duration(l.duration)}
                          {isLift(l)
                            ? " · passage estimé"
                            : l.mode === "BIKE" || l.mode === "RENTAL"
                              ? " · durée estimée"
                              : ""}
                          {l.cancelled ? (
                            <span className="disruption-text">Supprimé</span>
                          ) : delayMinutes(l) > 0 ? (
                            <span className="disruption-text">
                              Retard +{delayMinutes(l)} min
                            </span>
                          ) : (
                            l.realTime && (
                              <span className="live-dot">Temps réel</span>
                            )
                          )}
                        </span>
                        {hasApproximatePath(l) && (
                          <span className="leg-facts">
                            Tracé approximatif sur la carte
                          </span>
                        )}
                        {!isStreet(l) && <Alerts alerts={legAlerts(l)} />}
                        {isStreet(l) && <Directions leg={l} />}
                        {l.rental?.toStationName && (
                          <div className="rental-stations">
                            {l.rental.fromStationName && (
                              <div>Retrait à {l.rental.fromStationName}</div>
                            )}
                            <div>Retour à {l.rental.toStationName}</div>
                          </div>
                        )}
                        {l.reservation === "COMPULSORY" && (
                          <div className="reservation-detail">
                            <strong>Réservation obligatoire</strong>
                            {l.routeShortName === "Y85" && (
                              <>
                                {" · "}
                                <a href="tel:+33480007000">04 8000 7000</a>
                                {" · "}
                                <a
                                  href="https://www.laregionvoustransporte.fr/cars-region/cars-region-de-haute-savoie/ligne/y85-sallanches-passy-plaine-joux/"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Modalités Y85
                                </a>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
            <li className="leg last">
              <div className="leg-time">{time(item.endTime)}</div>
              <div className="leg-track destination" />
              <div className="leg-content">
                <strong>{item.legs.at(-1)?.to.name}</strong>
              </div>
            </li>
          </ol>
          {!item.legs.some((l) => l.realTime) &&
            transit.some(
              (l) => !isLift(l) && l.mode !== "BIKE" && l.mode !== "RENTAL",
            ) && (
              <p className="fine-print">
                Horaires prévus, sans mise à jour en temps réel.
              </p>
            )}
          {lift && (
            <p className="notice">
              <Info size={16} aria-hidden="true" />
              Modèle basé sur les heures d’ouverture et la durée publiée.
              Attente non mesurée ; ouverture à vérifier, notamment en
              maintenance.
            </p>
          )}
          {item.legs.some((leg) => leg.mode === "RENTAL") && (
            <p className="notice">
              <Info size={16} aria-hidden="true" />
              <span>
                Vérifiez les vélos et les places de retour avant le départ dans{" "}
                <a
                  href="https://montenvelo.fr/home-2/mode-demploi/"
                  target="_blank"
                  rel="noreferrer"
                >
                  l’application MontenVélo
                </a>
                .
              </span>
            </p>
          )}
          {fareHints.length > 0 && (
            <div className="fare-box">
              <span className="eyebrow">Repères de prix</span>
              {fareHints.map((f) => (
                <p key={f}>{f}</p>
              ))}
              <small>
                Tarifs publics relevés le 18/11/2026. Conditions et
                correspondances à vérifier ; ces montants ne constituent pas un
                devis.
              </small>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
