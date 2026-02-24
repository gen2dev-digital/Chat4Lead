import { getDistanceKmWithFallback } from '../../../services/distance.service';
import { calculerEstimation } from '../tarification-calculator';

// Séparateur utilisé par claude.provider.ts pour le prompt caching (Anthropic)
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
    // Split Accès
    etageDepart?: number;
    etageArrivee?: number;
    ascenseurDepart?: boolean;
    ascenseurArrivee?: boolean;
    // Compatibilité temporaire (redondance)
    etage?: number;
    ascenseur?: boolean;

    monteMeubleDepart?: boolean;
    monteMeubleArrivee?: boolean;
    objetSpeciaux?: any[];
}

const VOLUME_CALCULATOR: Record<string, number> = {
    'canapé 3 places': 3, 'canapé 2 places': 2, 'fauteuil': 0.5, 'table basse': 0.3,
    'meuble tv': 0.5, 'télévision': 0.1, 'bibliothèque': 1, 'buffet': 1.5,
    'table à manger': 1, 'chaise': 0.1, 'lit double': 2, 'lit simple': 1,
    'armoire': 2, 'commode': 0.5, 'table de chevet': 0.1, 'bureau': 0.8,
    'réfrigérateur': 1, 'congelateur': 1, 'lave-linge': 0.5, 'lave-vaisselle': 0.5,
    'cuisinière': 0.5, 'four micro-ondes': 0.1, 'carton': 0.1,
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
    const p = leadData.projetData || {};
    const hasContact = !!(leadData.nom && (leadData.telephone || leadData.email));

    const volume = typeof p.volumeEstime === 'number' ? p.volumeEstime : (p.volumeEstime ? parseFloat(String(p.volumeEstime)) : 0);
    const distanceKm = await getDistanceKmWithFallback(p.villeDepart || '', p.villeArrivee || '');
    const formuleRaw = (p.formule || '').toString().toLowerCase();
    const formule = ['eco', 'standard', 'luxe'].includes(formuleRaw) ? formuleRaw as 'eco' | 'standard' | 'luxe' : 'standard';

    const estimation = (volume > 0 && distanceKm >= 0 && hasContact)
        ? calculerEstimation({
            volume,
            distanceKm,
            formule,
            etageChargement: p.etageDepart ?? p.etage,
            ascenseurChargement: (p.ascenseurDepart ?? p.ascenseur) ? 1 : 0,
            etageLivraison: p.etageArrivee,
            ascenseurLivraison: p.ascenseurArrivee ? 1 : 0,
            supplementMonteMeuble: (p.monteMeubleDepart || p.monteMeubleArrivee) ? 150 : 0,
            supplementObjetsLourds: (p.objetSpeciaux?.length || 0) > 0 ? 150 : 0,
        })
        : null;

    const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // ─── PARTIE STATIQUE ───
    const staticPart = `# IDENTITÉ
Assistant expert pour ${entreprise.nom}. Bot: ${entreprise.nomBot}.
Aujourd'hui nous sommes le : ${today}.

# FORMATAGE (TRÈS IMPORTANT)
- JAMAIS de gras (** ou __), JAMAIS d'astérisques (*), JAMAIS de balises HTML.
- Pas de jargon ("CRM", "Lead", "Fiche", "DATA").
- Messages COURTS. Une seule question à la fois.

# RÈGLES DE VENTE (IMPÉRATIF)
1. ESTIMATION : N'affiche JAMAIS de prix avant d'avoir le NOM et le TÉLÉPHONE (ou Email).
2. TAXES : Toutes les estimations sont en TTC. Ne mentionne jamais "HT".
3. FORMULE : Si le volume est connu, demande : "Quelle formule préférez-vous : Éco, Standard ou Luxe ?"
4. RÉCAPITULATIF : Une fois TOUT collecté, fais un résumé rédigé complet incluant le prix TTC.

# WIDGETS (NE CHANGE PAS CES PHRASES)
- Visite : "Souhaiteriez-vous qu'un de nos conseillers se déplace chez vous ?"
- Créneau rappel : "Quel créneau vous arrange pour être recontacté ?"
- Satisfaction : "Comment avez-vous trouvé cette conversation ?"

# ÉTAPES
1. Trajet : Départ ET Arrivée (Ville+CP).
2. Habitation Départ : Maison/Appart, Étage, Ascenseur.
3. Habitation Arrivée : Maison/Appart, Étage, Ascenseur.
4. Volume : Liste de meubles ou estimation m3.
5. Formule : Éco / Standard / Luxe.
6. Visite : Proposer le RDV à domicile.
7. Coordonnées : Nom, Tél, Email.
8. Clôture : Résumé + Estimation TTC + Satisfaction.`;

    // ─── PARTIE DYNAMIQUE ───
    const dynamicPart = `# ÉTAT DU PARCOURS (Source de vérité)
## Coordonnées
${leadData.prenom || leadData.nom ? '✅ Identité : ' + (leadData.prenom || '') + ' ' + (leadData.nom || '') : '❌ Nom : Manquant'}
${leadData.telephone ? '✅ Tél : ' + leadData.telephone : '❌ Tél : Manquant'}
${leadData.email ? '✅ Email : ' + leadData.email : '❌ Email : Manquant'}

## Logement Départ 🏠
${p.villeDepart ? '✅ Ville : ' + p.villeDepart + (p.codePostalDepart ? ' (' + p.codePostalDepart + ')' : '') : '❌ Ville : Inconnue'}
${p.typeHabitationDepart ? '✅ Type : ' + p.typeHabitationDepart : '❌ Type : Inconnu'}
${p.etageDepart !== undefined || p.etage !== undefined ? '✅ Étage : ' + (p.etageDepart ?? p.etage) : '❌ Étage : Inconnu'}
${p.ascenseurDepart !== undefined || p.ascenseur !== undefined ? '✅ Ascenseur : ' + (p.ascenseurDepart ?? p.ascenseur ? 'Oui' : 'Non') : '❌ Ascenseur : Inconnu'}

## Logement Arrivée 📦
${p.villeArrivee ? '✅ Ville : ' + p.villeArrivee + (p.codePostalArrivee ? ' (' + p.codePostalArrivee + ')' : '') : '❌ Ville : Inconnue'}
${p.typeHabitationArrivee ? '✅ Type : ' + p.typeHabitationArrivee : '❌ Type : Inconnu'}
${p.etageArrivee !== undefined ? '✅ Étage : ' + p.etageArrivee : '❌ Étage : Inconnu'}
${p.ascenseurArrivee !== undefined ? '✅ Ascenseur : ' + (p.ascenseurArrivee ? 'Oui' : 'Non') : '❌ Ascenseur : Inconnu'}

## Projet
${volume > 0 ? '✅ Volume : ' + volume + ' m3' : '❌ Volume : Non estimé'}
${p.formule ? '✅ Formule : ' + p.formule : '❌ Formule : Non choisie'}
${p.creneauVisite ? '✅ RDV Visite : ' + p.creneauVisite : '❌ RDV Visite : Non fixé'}`;

    const dataBlock = `<!--DATA:${JSON.stringify({
        prenom: leadData.prenom || null,
        nom: leadData.nom || null,
        email: leadData.email || null,
        telephone: leadData.telephone || null,
        villeDepart: p.villeDepart || null,
        villeArrivee: p.villeArrivee || null,
        codePostalDepart: p.codePostalDepart || null,
        codePostalArrivee: p.codePostalArrivee || null,
        typeHabitationDepart: p.typeHabitationDepart || null,
        typeHabitationArrivee: p.typeHabitationArrivee || null,
        etageDepart: p.etageDepart ?? p.etage ?? null,
        etageArrivee: p.etageArrivee ?? null,
        ascenseurDepart: p.ascenseurDepart ?? p.ascenseur ?? null,
        ascenseurArrivee: p.ascenseurArrivee ?? null,
        volumeEstime: p.volumeEstime || null,
        formule: p.formule || null,
        creneauVisite: p.creneauVisite || null,
        creneauRappel: leadData.creneauRappel || null,
        satisfactionScore: leadData.satisfactionScore || null
    })}-->`;

    let res = staticPart + '\n\n' + PROMPT_CACHE_SEPARATOR + '\n\n' + dynamicPart;
    if (estimation && hasContact) {
        res += `\n\n# ESTIMATION TARIFAIRE (TTC)\n${estimation.min} € à ${estimation.max} €\n(Prestation ${estimation.formule})`;
    }

    return res + '\n\n# DONNÉES TECHNIQUES\n' + dataBlock;
}

function extractCollectedInfo(lead: LeadData): string[] { return []; }
function hasRdvVisite(lead: LeadData): boolean { return !!lead.projetData?.creneauVisite; }
function hasContactInfo(lead: LeadData): boolean { return !!(lead.nom && (lead.telephone || lead.email)); }
