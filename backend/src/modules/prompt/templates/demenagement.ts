export const PROMPT_CACHE_SEPARATOR = '### DYNAMIC_SECTION ###';

export interface EntrepriseConfig {
    nom: string;
    nomBot: string;
    email?: string;
    telephone?: string;
    zonesIntervention?: string | string[];
    tarifsCustom?: any;
    specificites?: any;
    documentsCalcul?: string[];
    consignesPersonnalisees?: string;
}

export interface LeadData {
    prenom?: string;
    nom?: string;
    email?: string;
    telephone?: string;
    creneauRappel?: string;
    satisfaction?: string;
    satisfactionScore?: number | null;
    projetData?: ProjetDemenagementData;
}

export interface ProjetDemenagementData {
    villeDepart?: string;
    villeArrivee?: string;
    codePostalDepart?: string;
    codePostalArrivee?: string;
    typeHabitationDepart?: string;
    typeHabitationArrivee?: string;
    stationnementDepart?: string;
    stationnementArrivee?: string;
    volumeEstime?: number | string;
    dateSouhaitee?: string;
    formule?: string;
    rdvConseiller?: boolean | null;
    creneauVisite?: string;
    etage?: number;
    ascenseur?: boolean;
    monteMeubleDepart?: boolean;
    monteMeubleArrivee?: boolean;
    objetSpeciaux?: any[];
}

import { getDistanceKmWithFallback } from '../../../services/distance.service';
import { calculerEstimation } from '../tarification-calculator';

const VOLUME_CALCULATOR: Record<string, number> = {
    'canapé 3 places': 3,
    'canapé 2 places': 2,
    'fauteuil': 0.5,
    'table basse': 0.3,
    'meuble tv': 0.5,
    'télévision': 0.1,
    'bibliothèque': 1,
    'buffet': 1.5,
    'table à manger': 1,
    'chaise': 0.1,
    'lit double': 2,
    'lit simple': 1,
    'armoire': 2,
    'commode': 0.5,
    'table de chevet': 0.1,
    'bureau': 0.8,
    'réfrigérateur': 1,
    'congelateur': 1,
    'lave-linge': 0.5,
    'lave-vaisselle': 0.5,
    'cuisinière': 0.5,
    'four micro-ondes': 0.1,
    'carton': 0.1,
};

export function calculateVolume(items: Record<string, number>): number {
    return Object.entries(items).reduce((total, [meuble, qty]) => {
        return total + (VOLUME_CALCULATOR[meuble] ?? 0) * qty;
    }, 0);
}

export async function buildPromptDemenagement(
    entreprise: EntrepriseConfig,
    leadData: LeadData
): Promise<string> {
    const infosCollectees = extractCollectedInfo(leadData);
    const rdvVisite = hasRdvVisite(leadData);
    const contactDeja = hasContactInfo(leadData);

    const p = leadData.projetData || {};
    const volume = typeof p.volumeEstime === 'number' ? p.volumeEstime : (p.volumeEstime ? parseFloat(String(p.volumeEstime)) : 0);
    const villeDepart = p.villeDepart || '';
    const villeArrivee = p.villeArrivee || '';
    const formuleRaw = (p.formule || '').toString().toLowerCase();
    const formule = ['eco', 'standard', 'luxe'].includes(formuleRaw) ? formuleRaw as 'eco' | 'standard' | 'luxe' : 'standard';
    const distanceKm = await getDistanceKmWithFallback(villeDepart, villeArrivee);
    const supplementMonteMeuble = computeSupplementMonteMeuble(p);
    const supplementObjetsLourds = Array.isArray(p.objetSpeciaux) && p.objetSpeciaux.length > 0 ? 150 : 0;

    const estimation = volume > 0 && distanceKm >= 0 && villeDepart && villeArrivee
        ? calculerEstimation({
            volume,
            distanceKm,
            formule,
            etageChargement: typeof p.etage === 'number' ? p.etage : undefined,
            ascenseurChargement: p.ascenseur === true ? 1 : 0,
            supplementMonteMeuble,
            supplementObjetsLourds,
        })
        : null;

    const staticPart = buildStaticSection(entreprise);
    const dynamicPart = buildDynamicSection(leadData, infosCollectees, estimation, rdvVisite, contactDeja, distanceKm);
    const dataBlock = buildDataBlock(p, leadData);

    return staticPart + PROMPT_CACHE_SEPARATOR + dynamicPart + '\n\n# DONNÉES ACTUELLES (À REPORTER DANS TON BLOC DATA)\n' + dataBlock;
}

function buildDataBlock(p: ProjetDemenagementData, lead: LeadData): string {
    const data = {
        prenom: lead.prenom || null,
        nom: lead.nom || null,
        email: lead.email || null,
        telephone: lead.telephone || null,
        villeDepart: p.villeDepart || null,
        villeArrivee: p.villeArrivee || null,
        codePostalDepart: p.codePostalDepart || null,
        codePostalArrivee: p.codePostalArrivee || null,
        typeHabitationDepart: p.typeHabitationDepart || null,
        typeHabitationArrivee: p.typeHabitationArrivee || null,
        stationnementDepart: p.stationnementDepart || null,
        stationnementArrivee: p.stationnementArrivee || null,
        volumeEstime: p.volumeEstime || null,
        dateSouhaitee: p.dateSouhaitee || null,
        formule: p.formule || null,
        rdvConseiller: p.rdvConseiller ?? null,
        creneauVisite: p.creneauVisite || null,
        creneauRappel: lead.creneauRappel || null,
        satisfactionScore: lead.satisfactionScore || null
    };
    return `<!--DATA:${JSON.stringify(data)}-->`;
}

function buildStaticSection(entreprise: EntrepriseConfig): string {
    return `# IDENTITÉ
Assistant expert pour ${entreprise.nom}. Bot: ${entreprise.nomBot}.

# FORMATAGE
- INTERDIT : astérisques (*), gras (**), balises HTML.
- CONCISION : messages courts, une seule question par message.

# MÉMOIRE ET ANTI-RÉPÉTITION (CRITIQUE)
- NE JAMAIS redemander ce qui est présent dans # ÉTAT DU PARCOURS (marqué ✅).
- Si le lead a déjà choisi une date et un créneau de visite → NE PLUS EN PARLER.
- Si le lead a déjà donné Nom/Tél/Mail → NE PLUS LES DEMANDER.

# ORDRE DES QUESTIONS (STRATÉGIE)

## ÉTAPE 1 — LE PROJET (Lieux, Accès, Volume)
1. Trajet (Ville + CP).
2. Logement (Maison/Appartement, Surface).
3. Accès Départ (Étage, Ascenseur, Stationnement).
4. VOLUME : Confirmer ou calculer via liste de meubles.

## ÉTAPE 2 — VISITE CONSEILLER
Dès que le volume est connu : "Souhaiteriez-vous qu'un de nos conseillers se déplace chez vous ?"
- SI OUI : Demander Date (Calendrier) puis Créneau (Matin/Après-midi).
- UNE FOIS FIXÉ : Passer aux coordonnées.

## ÉTAPE 3 — COORDONNÉES (SI MANQUANTES)
- Demander Prénom + Nom, puis Tél + Email.
- NE PAS demander ce qui est déjà marqué ✅ dans l'état du parcours.
- Si tout est ✅, sauter cette étape.

## ÉTAPE 4 — FINALISATION ET CLÔTURE
- Arrivée (Type logement, accès).
- Date du déménagement.
- RÉCAPITULATIF COMPLET (Inclure prix, RDV, coordonnées).
- CRÉNEAU RAPPEL (si téléphone présent).
- SATISFACTION (Comment avez-vous trouvé cette conversation ?).
- FIN : Une fois tout collecté, message de remerciement final. NE PLUS POSER DE QUESTIONS.`;
}

function buildDynamicSection(
    leadData: LeadData,
    infosCollectees: string[],
    estimation: any,
    rdvVisite: boolean,
    contactDeja: boolean,
    distanceKm?: number
): string {
    const p = leadData.projetData || {};
    let status = "# \u00c9TAT DU PARCOURS (Source de v\u00e9rit\u00e9)\n";
    status += leadData.prenom ? `- Pr\u00e9nom : ${leadData.prenom} \u2705\n` : "- Pr\u00e9nom : [Manquant]\n";
    status += leadData.nom ? `- Nom : ${leadData.nom} \u2705\n` : "- Nom : [Manquant]\n";
    status += leadData.email ? `- Email : ${leadData.email} \u2705\n` : "- Email : [Manquant]\n";
    status += leadData.telephone ? `- T\u00e9l\u00e9phone : ${leadData.telephone} \u2705\n` : "- T\u00e9l\u00e9phone : [Manquant]\n";
    status += p.villeDepart ? `- D\u00e9part : ${p.villeDepart} \u2705\n` : "- D\u00e9part : [Inconnu]\n";
    status += p.villeArrivee ? `- Arriv\u00e9e : ${p.villeArrivee} \u2705\n` : "- Arriv\u00e9e : [Inconnu]\n";
    status += p.volumeEstime ? `- Volume : ${p.volumeEstime} m3 \u2705\n` : "- Volume : [Non estim\u00e9]\n";
    status += p.creneauVisite ? `- Visite fix\u00e9e : ${p.creneauVisite} \u2705\n` : "- Visite fix\u00e9e : Non\n";

    let dynamic = status + "\n";
    if (estimation) {
        dynamic += `# ESTIMATION\n${estimation.min} \u00e0 ${estimation.max} \u20ac\n\n`;
    }
    return dynamic;
}

function extractCollectedInfo(lead: LeadData): string[] {
    const infos = [];
    if (lead.prenom) infos.push('prenom');
    if (lead.nom) infos.push('nom');
    if (lead.email) infos.push('email');
    if (lead.telephone) infos.push('telephone');
    const p = lead.projetData || {};
    if (p.villeDepart) infos.push('villeDepart');
    if (p.villeArrivee) infos.push('villeArrivee');
    if (p.volumeEstime) infos.push('volume');
    return infos;
}

function hasRdvVisite(lead: LeadData): boolean {
    return !!lead.projetData?.creneauVisite;
}

function hasContactInfo(lead: LeadData): boolean {
    return !!(lead.email && lead.telephone);
}

function computeSupplementMonteMeuble(p: ProjetDemenagementData): number {
    return (p.monteMeubleDepart || p.monteMeubleArrivee) ? 150 : 0;
}

function formatContactCloture(entreprise: EntrepriseConfig): string {
    return entreprise.telephone || entreprise.email || "rapidement";
}
