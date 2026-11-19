const timeZone = "Europe/Paris";

export const time = (value: string | number | Date) =>
  new Date(value).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });

export const duration = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? " " + String(rest).padStart(2, "0") : ""}`;
};

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const shortDay = new Intl.DateTimeFormat("fr-FR", {
  timeZone,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const longDay = new Intl.DateTimeFormat("fr-FR", {
  timeZone,
  weekday: "long",
  day: "numeric",
  month: "long",
});

export const dayKey = (value: string | number | Date) =>
  dayKeyFormat.format(new Date(value));
export const formatShortDay = (value: string | number | Date) =>
  shortDay.format(new Date(value));
export const formatLongDay = (value: string | number | Date) =>
  longDay.format(new Date(value));

const nextDayKey = (key: string) =>
  new Date(Date.parse(key + "T12:00:00Z") + 86_400_000)
    .toISOString()
    .slice(0, 10);

/**
 * Labels a trip that leaves on another day than the one searched: "Aujourd’hui" or "Demain" relative to
 * the current day, otherwise a short date. Undefined when it leaves on the searched day.
 */
export function relativeDay(
  value: string | number | Date,
  searched: string | number | Date,
  now = Date.now(),
) {
  const day = dayKey(value);
  if (day === dayKey(searched)) return undefined;
  const today = dayKey(now);
  return day === today
    ? "Aujourd’hui"
    : day === nextDayKey(today)
      ? "Demain"
      : formatShortDay(value);
}

export function localDateTime(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
