/**
 * Calculateur d'estimation tarifaire pour les tests (phases 1 à 3).
 * Formule identique au fichier tarification fourni : prend en compte
 * volume (m³), distance (km) départ → arrivée, formule (eco/standard/luxe),
 * et options (étages, ascenseur, portage).
 *
 * Les distances sont calculées à la volée via services/distance.service.ts (OpenRouteService).
 */

const MULTIPLICATEUR_FOURCHETTE_MAX = 1.25;
const PRIX_MINIMUM_ESTIMATION = 200;
const ECART_MINIMUM_FOURCHETTE = 50;

type FormuleType = 'eco' | 'standard' | 'luxe';

function calculerForfait(volume: number, distance: number, type: FormuleType): number {
    let coefVol1 = 0, coefVol2 = 0, coefDist1 = 0, coefDist2 = 0, coefDist3 = 0, const1 = 0, const2 = 0, multiFin = 1;
    const C4 = volume;
    const H4 = distance;

    if (type === 'eco') {
        coefVol1 = 24; coefVol2 = 30; coefDist1 = 2.7; coefDist2 = 0.69; coefDist3 = 1.8; const1 = 76; const2 = 73;
    } else if (type === 'standard') {
        coefVol1 = 27; coefVol2 = 34; coefDist1 = 2.7; coefDist2 = 0.69; coefDist3 = 1.8; const1 = 76; const2 = 73; multiFin = 1.05;
    } else if (type === 'luxe') {
        coefVol1 = 35; coefVol2 = 44; coefDist1 = 2.7; coefDist2 = 0.69; coefDist3 = 1.8; const1 = 76; const2 = 73;
    }

    if (C4 <= 0 || H4 <= 0) return 0;

    let forfait: number;
    if (C4 < 20) {
        if (H4 < 250) {
            if (H4 < 30) forfait = 1 * coefDist1 + C4 * coefVol1 + const1;
            else forfait = H4 * coefDist1 + C4 * coefVol1 + const1;
        } else {
            forfait = H4 * coefDist2 + C4 * coefVol1 + const2;
        }
    } else {
        if (H4 < 30) forfait = 40 * coefDist3 + C4 * coefVol2;
        else forfait = H4 * coefDist3 + C4 * coefVol2;
    }
    return forfait * multiFin;
}

function calculerSupplementEtage(etage: number, ascenseur: number, volume: number): number {
    if (volume <= 0) return 0;
    if (etage > 2) return ascenseur > 0 ? (etage - 2) * volume : (etage - 2) * volume * 2;
    return 0;
}

function calculerSupplementPortage(portCharg: number, portLiv: number, volume: number): number {
    if (volume <= 0) return 0;
    const total = portCharg + portLiv;
    if (total > 25) return (total / 25) * 2 * volume;
    return 0;
}

export interface EstimationInput {
    volume: number;
    distanceKm: number;
    formule: FormuleType;
    etageChargement?: number;
    ascenseurChargement?: number;
    portageChargement?: number;
    etageLivraison?: number;
    ascenseurLivraison?: number;
    portageLivraison?: number;
    supplementMonteMeuble?: number;
    supplementObjetsLourds?: number;
}

export interface EstimationResult {
    min: number;
    max: number;
    formule: string;
}

/**
 * Calcule l'estimation min/max en € à partir du volume, de la distance et de la formule.
 * La distance (départ → arrivée) est bien prise en compte dans le forfait de base.
 */
export function calculerEstimation(input: EstimationInput): EstimationResult | null {
    const { volume, distanceKm, formule } = input;
    if (volume <= 0 || distanceKm < 0) return null;

    const type = formule.toLowerCase() as FormuleType;
    if (!['eco', 'standard', 'luxe'].includes(type)) return null;

    const base = calculerForfait(volume, distanceKm, type);
    const etageC = input.etageChargement ?? 0;
    const ascC = input.ascenseurChargement ?? 0;
    const portC = input.portageChargement ?? 0;
    const etageL = input.etageLivraison ?? 0;
    const ascL = input.ascenseurLivraison ?? 0;
    const portL = input.portageLivraison ?? 0;

    const suppC = calculerSupplementEtage(etageC, ascC, volume);
    const suppL = calculerSupplementEtage(etageL, ascL, volume);
    const suppP = calculerSupplementPortage(portC, portL, volume);
    const suppM = input.supplementMonteMeuble ?? 0;
    const suppLourds = input.supplementObjetsLourds ?? 0;

    let totalMin = base + suppC + suppL + suppP + suppM + suppLourds;
    let totalMax = totalMin * MULTIPLICATEUR_FOURCHETTE_MAX;

    const arrMin = (v: number) => Math.max(PRIX_MINIMUM_ESTIMATION, Math.round(v / 10) * 10);
    const arrMax = (v: number, min: number) => Math.max(min + ECART_MINIMUM_FOURCHETTE, Math.round(v / 10) * 10);

    const min = arrMin(totalMin);
    const max = arrMax(totalMax, min);

    return { min, max, formule: type.toUpperCase() };
}
