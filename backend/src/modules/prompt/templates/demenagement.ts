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
    etage?: number;
    ascenseur?: boolean;
    monteMeubleDepart?: boolean;
    monteMeubleArrivee?: boolean;
    objetSpeciaux?: any[];
}

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

/**
 * Construit le prompt complet pour le métier du déménagement.
 * Utilise le prompt caching Anthropic en séparant la partie statique de la partie dynamique.
 */
export async function buildPromptDemenagement(
    entreprise: EntrepriseConfig,
    leadData: LeadData
): Promise<string> {
    const infosCollectees = extractCollectedInfo(leadData);
    const hasContact = !!(leadData.nom && leadData.telephone);
    const p = leadData.projetData || {};

    // Conversion volume
    const volume = typeof p.volumeEstime === 'number' ? p.volumeEstime : (p.volumeEstime ? parseFloat(String(p.volumeEstime)) : 0);

    // Distance (via OpenRouteService)
    const distanceKm = await getDistanceKmWithFallback(p.villeDepart || '', p.villeArrivee || '');

    // Formule
    const formuleRaw = (p.formule || '').toString().toLowerCase();
    const formule = ['eco', 'standard', 'luxe'].includes(formuleRaw) ? formuleRaw as 'eco' | 'standard' | 'luxe' : 'standard';

    // Calcul estimation
    const estimation = (volume > 0 && distanceKm >= 0 && hasContact)
        ? calculerEstimation({
            volume,
            distanceKm,
            formule,
            etageChargement: p.etage,
            ascenseurChargement: p.ascenseur ? 1 : 0,
            supplementMonteMeuble: (p.monteMeubleDepart || p.monteMeubleArrivee) ? 150 : 0,
            supplementObjetsLourds: (p.objetSpeciaux?.length || 0) > 0 ? 150 : 0,
        })
        : null;

    const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // ─── PARTIE STATIQUE (Enregistrée en cache) ───
    const staticPart = `# IDENTITÉ
Assistant expert pour ${entreprise.nom}. Bot: ${entreprise.nomBot}.
Aujourd'hui nous sommes le : ${today}.

# FORMATAGE
- INTERDIT : astérisques (*), gras (**), balises HTML.
- CONCISION : messages courts, une seule question par message.
- TON : professionnel, rassurant, expert.

# RÈGLES DE VENTE (IMPÉRATIF)
1. ESTIMATION : N'affiche JAMAIS de prix avant d'avoir le NOM et le TÉLÉPHONE.
2. TAXES : Toutes les estimations sont en TTC (Toutes Taxes Comprises). Ne jamais mentionner HT.
3. FORMULE : Si le volume est connu, demande : "Quelle formule préférez-vous : Éco, Standard ou Luxe ?"
4. RÉCAPITULATIF : Une fois toutes les informations collectées, fais un résumé détaillé et bienveillant avant de conclure.

# WIDGETS (VERROUILLAGE DES PHRASES)
Pour déclencher les outils interactifs, utilise EXACTEMENT ces phrases :
- Pour la visite : "Souhaiteriez-vous qu'un de nos conseillers se déplace chez vous ?"
- Pour le créneau de rappel : "Quel créneau vous arrange pour être recontacté ?"
- Pour la fin (satisfaction) : "Comment avez-vous trouvé cette conversation ?"

# ÉTAPES DE QUALIFICATION
1. Trajet (Ville + CP).
2. Logement (Maison/Appartement, Surface, Accès).
3. Volume (Liste de meubles ou m3).
4. Formule de service (Éco/Standard/Luxe).
5. Visite à domicile (Proposer le RDV).
6. Coordonnées (Prénom + Nom, Tél + Email).
7. Résumé + Estimation TTC + Satisfaction.`;

    // ─── PARTIE DYNAMIQUE (Variable à chaque tour) ───
    const dynamicPart = `# ÉTAT DU PARCOURS (Source de vérité)
${leadData.prenom ? '✅ Prénom : ' + leadData.prenom : '❌ Prénom : Manquant'}
${leadData.nom ? '✅ Nom : ' + leadData.nom : '❌ Nom : Manquant'}
${leadData.email ? '✅ Email : ' + leadData.email : '❌ Email : Manquant'}
${leadData.telephone ? '✅ Téléphone : ' + leadData.telephone : '❌ Téléphone : Manquant'}
${p.villeDepart ? '✅ Ville Départ : ' + p.villeDepart : '❌ Ville Départ : Inconnue'}
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
        volumeEstime: p.volumeEstime || null,
        formule: p.formule || null,
        creneauVisite: p.creneauVisite || null,
        creneauRappel: leadData.creneauRappel || null,
        satisfactionScore: leadData.satisfactionScore || null
    })}-->`;

    let res = staticPart + '\n\n' + PROMPT_CACHE_SEPARATOR + '\n\n' + dynamicPart;

    // Ajout de l'estimation seulement si on a le contact
    if (estimation && hasContact) {
        res += `\n\n# ESTIMATION TARIFÈRE (TTC)\n${estimation.min} € à ${estimation.max} €\n(Basée sur la formule ${estimation.formule})`;
    }

    return res + '\n\n# DONNÉES TECHNIQUES (À REPORTER DANS TON BLOC DATA)\n' + dataBlock;
}

function extractCollectedInfo(lead: LeadData): string[] {
    const infos = [];
    if (lead.prenom) infos.push('prenom');
    if (lead.nom) infos.push('nom');
    if (lead.email) infos.push('email');
    if (lead.telephone) infos.push('telephone');
    return infos;
}

function hasRdvVisite(lead: LeadData): boolean { return !!lead.projetData?.creneauVisite; }
function hasContactInfo(lead: LeadData): boolean { return !!(lead.nom && lead.telephone); }
