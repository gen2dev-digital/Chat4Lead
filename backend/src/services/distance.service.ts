/**
 * Service de calcul des distances via API externe (OpenRouteService).
 * Remplace les distances en dur par des calculs à la volée.
 */

import { logger } from '../utils/logger';

const OPENROUTESERVICE_API_KEY = process.env.OPENROUTESERVICE_API_KEY || '';
const GEOCODE_BASE = 'https://api.openrouteservice.org/geocode/search';
const MATRIX_BASE = 'https://api.openrouteservice.org/v2/matrix/driving-car';

/** Valeur par défaut si l'API échoue (évite de bloquer l'estimation). */
const FALLBACK_DISTANCE_KM = 150;

/**
 * Géocode une ville/adresse et retourne [lon, lat] ou null.
 */
async function geocode(ville: string): Promise<[number, number] | null> {
    if (!ville?.trim()) return null;
    if (!OPENROUTESERVICE_API_KEY) {
        logger.warn('[Distance] OPENROUTESERVICE_API_KEY manquante, géocodage impossible');
        return null;
    }
    try {
        const url = `${GEOCODE_BASE}?api_key=${encodeURIComponent(OPENROUTESERVICE_API_KEY)}&text=${encodeURIComponent(ville.trim())}&limit=1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
            logger.warn('[Distance] Geocode API error', { status: res.status, ville });
            return null;
        }
        const data = (await res.json()) as { features?: Array<{ geometry?: { coordinates?: number[] } }> };
        const coords = data?.features?.[0]?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
            return [Number(coords[0]), Number(coords[1])];
        }
        return null;
    } catch (err) {
        logger.warn('[Distance] Geocode failed', { ville, error: err instanceof Error ? err.message : String(err) });
        return null;
    }
}

/**
 * Calcule la distance en km entre deux villes via OpenRouteService.
 * Retourne null si les villes sont identiques, ou en cas d'erreur (avec fallback optionnel).
 */
export async function getDistanceKmAsync(
    villeDepart: string,
    villeArrivee: string,
    options?: { fallbackOnError?: number }
): Promise<number | null> {
    if (!villeDepart?.trim() || !villeArrivee?.trim()) return null;

    const depNorm = villeDepart.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const arrNorm = villeArrivee.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    if (depNorm === arrNorm) return 0;

    if (!OPENROUTESERVICE_API_KEY) {
        logger.warn('[Distance] OPENROUTESERVICE_API_KEY manquante');
        return options?.fallbackOnError ?? null;
    }

    const [coordDep, coordArr] = await Promise.all([geocode(villeDepart), geocode(villeArrivee)]);
    if (!coordDep || !coordArr) {
        logger.warn('[Distance] Geocoding failed', { villeDepart, villeArrivee });
        return options?.fallbackOnError ?? null;
    }

    try {
        const res = await fetch(MATRIX_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: OPENROUTESERVICE_API_KEY },
            body: JSON.stringify({
                locations: [coordDep, coordArr],
                sources: ['0'],
                destinations: ['1'],
                metrics: ['distance'],
            }),
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
            const text = await res.text();
            logger.warn('[Distance] Matrix API error', { status: res.status, body: text.slice(0, 200) });
            return options?.fallbackOnError ?? null;
        }

        const data = (await res.json()) as { distances?: number[][] };
        const distMeters = data?.distances?.[0]?.[0];
        if (typeof distMeters === 'number' && distMeters >= 0) {
            return Math.round(distMeters / 1000);
        }
        return options?.fallbackOnError ?? null;
    } catch (err) {
        logger.warn('[Distance] Matrix failed', {
            villeDepart,
            villeArrivee,
            error: err instanceof Error ? err.message : String(err),
        });
        return options?.fallbackOnError ?? null;
    }
}

/**
 * Version avec fallback : retourne toujours un nombre (pour compatibilité estimation).
 * Utilise FALLBACK_DISTANCE_KM en cas d'échec.
 */
export async function getDistanceKmWithFallback(
    villeDepart: string,
    villeArrivee: string
): Promise<number> {
    const km = await getDistanceKmAsync(villeDepart, villeArrivee, {
        fallbackOnError: FALLBACK_DISTANCE_KM,
    });
    return km ?? 0;
}
