import type { Place } from "./types";

export const HERE = "Ma position";

/** Routes only exist inside the area the API accepts; matches the bounds in server/api.ts. */
const inValley = (lat: number, lon: number) =>
  lat >= 45.7 && lat <= 46.1 && lon >= 6.4 && lon <= 7.1;

export function locate(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(Error("Ce navigateur ne permet pas de vous localiser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!inValley(coords.latitude, coords.longitude))
          reject(Error("Votre position est en dehors du Pays du Mont-Blanc."));
        else
          resolve({
            name: HERE,
            lat: coords.latitude,
            lon: coords.longitude,
            here: true,
          });
      },
      (error) =>
        reject(
          Error(
            error.code === error.PERMISSION_DENIED
              ? "Autorisez la localisation dans les réglages du navigateur."
              : "Position introuvable. Réessayez dans un instant.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  });
}
