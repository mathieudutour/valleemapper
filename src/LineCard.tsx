import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { modeLabel, type LineDetails, type LineStop } from "./types";
import { duration, formatShortDay, time } from "./format";
import { stopName } from "./places";
import { Alerts, FareBox, fares, Reservation } from "./Journey";
import { lineTitle, networkName, rideSpan, type LineRef } from "./lines";

type Span = NonNullable<ReturnType<typeof rideSpan>>;

/** Stops down the line, the rider's part of it drawn stronger. */
function Stops({
  stops,
  first,
  last,
  span,
  label,
}: {
  stops: LineStop[];
  first: number;
  last: number;
  span?: Span;
  label: (stop: LineStop) => string;
}) {
  return (
    <ol className="line-stops">
      {stops.slice(first, last + 1).map((stop, n) => {
        const i = first + n;
        const role = !span
          ? ""
          : i === span.from
            ? span.alights
              ? "Montée"
              : "Cet arrêt"
            : span.alights && i === span.to
              ? "Descente"
              : "";
        return (
          <li
            key={i}
            className={
              (span && (i < span.from || i > span.to) ? "off " : "") +
              (role ? "end" : "")
            }
          >
            <span className="line-stop-time">
              {stop.scheduledTime && (
                <del>
                  <span className="sr-only">prévu à </span>
                  {time(stop.scheduledTime)}
                </del>
              )}
              {stop.time && time(stop.time)}
            </span>
            <span className="line-stop-dot" />
            <span>
              {label(stop)}
              {role && <small>{role}</small>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function LineCard({
  line,
  details,
  error,
}: {
  line: LineRef;
  /** Missing while the line loads, and when it could not be. */
  details?: LineDetails;
  error?: string;
}) {
  const [before, setBefore] = useState(false),
    [after, setAfter] = useState(false);
  if (!details)
    return (
      <article className="poi-card line-card" aria-labelledby="line-title">
        <div className="poi-heading">
          <span className="line-badge">{line.name}</span>
        </div>
        <h2 id="line-title" tabIndex={-1}>
          Ligne {line.name}
        </h2>
        <p role="status">{error ?? "Chargement de la ligne…"}</p>
      </article>
    );

  const { stops } = details;
  const rail = /RAIL|TRAM|SUBURBAN/.test(details.mode);
  const label = (stop: LineStop) => stopName(stop, rail);
  const last = stops.length - 1;
  const span = rideSpan(stops, details.board, line.alight);
  const run =
    stops[0].time && stops[last].time
      ? (Date.parse(stops[last].time) - Date.parse(stops[0].time)) / 1000
      : 0;
  const today = formatShortDay(new Date());
  const earlier = span ? span.from : 0,
    later = span ? last - span.to : 0;
  return (
    <article className="poi-card line-card" aria-labelledby="line-title">
      <div className="poi-heading">
        <span className="line-badge">{details.name}</span>
        <span className="eyebrow">
          {[
            modeLabel[details.mode],
            networkName(details.routeId, details.operator),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <h2 id="line-title" tabIndex={-1}>
        {lineTitle(details.longName) ?? `Ligne ${details.name}`}
      </h2>
      <p>
        Direction <strong>{label(stops[last])}</strong>
        <br />
        {stops.length} arrêts
        {run > 0 && ` · ${duration(run)} de bout en bout`}
      </p>
      {details.cancelled && (
        <p>
          <span className="disruption-badge">Course supprimée</span>
        </p>
      )}
      <Alerts alerts={details.alerts} />
      {details.requiresReservation && <Reservation line={details.name} />}
      {span && !!details.passings?.length && (
        <section className="line-section">
          <h3>Prochains passages à {label(stops[span.from])}</h3>
          <ul className="line-passings">
            {details.passings.map((passing) => {
              const day = formatShortDay(passing.time);
              return (
                <li key={passing.time}>
                  <strong>{time(passing.time)}</strong>
                  {day !== today && <small>{day}</small>}
                  {passing.realTime && (
                    <small className="live-dot">Temps réel</small>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section className="line-section">
        <h3>
          {span?.alights ? "Votre trajet sur la ligne" : "Arrêts desservis"}
        </h3>
        {earlier > 0 &&
          (before ? (
            <Stops
              stops={stops}
              first={0}
              last={earlier - 1}
              span={span}
              label={label}
            />
          ) : (
            <button className="line-fold" onClick={() => setBefore(true)}>
              {earlier} arrêt{earlier > 1 && "s"} avant · depuis{" "}
              {label(stops[0])}
            </button>
          ))}
        <Stops
          stops={stops}
          first={earlier}
          last={last - later}
          span={span}
          label={label}
        />
        {later > 0 &&
          (after ? (
            <Stops
              stops={stops}
              first={last - later + 1}
              last={last}
              span={span}
              label={label}
            />
          ) : (
            <button className="line-fold" onClick={() => setAfter(true)}>
              {later} arrêt{later > 1 && "s"} après · jusqu’à{" "}
              {label(stops[last])}
            </button>
          ))}
        {!details.realTime && (
          <p className="fine-print">
            Horaires prévus, sans mise à jour en temps réel.
          </p>
        )}
      </section>
      <FareBox
        hints={fares([
          {
            routeId: details.routeId,
            routeShortName: details.name,
            mode: details.mode,
          },
        ])}
      />
      {details.operatorUrl && (
        <div className="poi-links">
          <a
            className="source-link"
            href={details.operatorUrl}
            target="_blank"
            rel="noreferrer"
          >
            Voir le service <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      )}
    </article>
  );
}
