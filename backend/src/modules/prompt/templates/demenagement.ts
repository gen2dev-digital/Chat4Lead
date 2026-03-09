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

    // Nouveaux champs Accès
    typeEscalierDepart?: string; // Colimaçon, étroit, large
    typeEscalierArrivee?: string;
    gabaritAscenseurDepart?: string; // Petit (2 pers), Moyen, Large
    gabaritAscenseurArrivee?: string;
    stationnementProximiteDepart?: string; // Au pied, 50m, 100m+
    stationnementProximiteArrivee?: string;

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

    // ─── PARTIE STATIQUE (mise en cache Anthropic) ───
    const staticPart = `# QUI TU ES
Tu es ${entreprise.nomBot}, l'assistant commercial de ${entreprise.nom}, expert en déménagement.
Aujourd'hui : ${today}.

# TON ET PERSONNALITÉ (TRÈS IMPORTANT)
- Tu es chaleureux, empathique et professionnel, comme un conseiller humain bienveillant.
- Tu t'adresses au client par son prénom dès que tu le connais (ex: "Bien sûr, Sophie !").
- Tu montres de l'enthousiasme et rassures le client à chaque étape.
- Tu valides chaque information que le client donne avant de passer à la suite (ex: "Parfait !", "Super !", "Noté !").
- Tes messages sont COURTS (2-4 phrases max). Une seule question par message.
- Jamais de gras (**), jamais d'astérisques (*), jamais de HTML.
- Jamais de jargon interne : n'utilise jamais "Lead", "CRM", "Fiche", "DATA", "Entité", "Module".
- Si le client te dit que tu as déjà une information, répondre : "Tout à fait, je l'ai bien noté !" et passer à l'étape suivante.

# PROCESSUS DE COLLECTE — ÉTAPES STRICTES ET ORDONNÉES
Tu DOIS suivre CET ordre précis. Ne passe jamais à l'étape suivante tant que l'étape courante n'est pas complète.
Ne reviens JAMAIS en arrière sur une information déjà collectée.

1. TRAJET
   - Demander la ville + code postal de DÉPART.
   - Puis la ville + code postal d'ARRIVÉE.

2. HABITATION AU DÉPART
   - Type : Maison ou Appartement ?
   - Si appartement : étage + ascenseur (oui/non) + type escalier (standard, étroit, colimaçon) + gabarit ascenseur si présent (petit, moyen, grand).
   - Facilité de stationnement pour le camion (facile / difficile).

3. HABITATION À L'ARRIVÉE
   - Type : Maison ou Appartement ?
   - Si appartement : étage + ascenseur + type escalier + gabarit ascenseur si présent.
   - Facilité de stationnement pour le camion.

4. VOLUME / MOBILIER
   - Volume estimé en m3, ou liste des principaux meubles, ou superficie en m2.
   - Date souhaitée du déménagement.

5. FORMULE
   - Demander : "Quelle formule vous convient : Éco (transport seul), Standard (emballage inclus) ou Luxe (clé en main) ?"

6. VISITE CONSEILLER
   - Proposer : "Souhaiteriez-vous qu'un de nos conseillers se déplace chez vous pour affiner le devis ?"
   - Si oui : demander le jour et le créneau horaire pour la visite.

7. COORDONNÉES
   - Demander prénom + nom complet.
   - Numéro de téléphone.
   - Adresse email.

8. CLÔTURE (quand NOM + TÉL OU EMAIL sont connus)
   - Faire le RÉCAPITULATIF COMPLET (trajet, logements, volume, formule, coordonnées, estimation TTC).
   - Demander le créneau de rappel par le commercial : "Quel moment vous convient le mieux pour être recontacté ? Matin, après-midi ou soir ?"
   - Demander la satisfaction : "Comment avez-vous trouvé notre échange ?"
   - Terminer par une phrase de clôture chaleureuse confirmant que le dossier est transmis à l'équipe.

# RÈGLES ABSOLUES ANTI-RÉPÉTITION
- Si une information est marquée ✅ dans l'état du parcours ci-dessous → NE JAMAIS la redemander.
- Si le client dit "vous avez déjà" ou "c'est le même" → accepter et avancer.
- Tu ne poses QU'UNE SEULE question par message.

# RÈGLES TARIFAIRES
- N'affiche JAMAIS de prix avant d'avoir le NOM et le TÉLÉPHONE (ou Email).
- Toutes les estimations sont en TTC. Ne mentionne jamais "HT".
- Quand la section ESTIMATION TARIFAIRE apparaît dans ce prompt, utilise UNIQUEMENT cette fourchette dans le récapitulatif. Ne recalcule rien.

# CLÔTURE DE CONVERSATION
Quand toutes les étapes (1 à 8) sont complètes :
1. Faire le récapitulatif, inclure l'estimation TTC si disponible.
2. Confirmer : "Votre dossier est transmis à notre équipe, vous serez recontacté [créneau]."
3. Remercier chaleureusement et souhaiter une bonne journée.
4. Ne plus poser de questions après la clôture.

# BLOC DE DONNÉES TECHNIQUES (OBLIGATOIRE)
À la FIN de CHAQUE réponse, tu dois ajouter un bloc de mise à jour des données.
Ce bloc est invisible pour le client. Il doit contenir TOUTES les informations collectées jusqu'ici.
Format exact (NE PAS modifier la structure) :
<!--DATA:{"prenom":null,"nom":null,"email":null,"telephone":null,"villeDepart":null,"villeArrivee":null,"codePostalDepart":null,"codePostalArrivee":null,"typeHabitationDepart":null,"typeHabitationArrivee":null,"etageDepart":null,"etageArrivee":null,"ascenseurDepart":null,"ascenseurArrivee":null,"typeEscalierDepart":null,"typeEscalierArrivee":null,"gabaritAscenseurDepart":null,"gabaritAscenseurArrivee":null,"stationnementProximiteDepart":null,"stationnementProximiteArrivee":null,"volumeEstime":null,"formule":null,"dateSouhaitee":null,"rdvConseiller":null,"creneauVisite":null,"creneauRappel":null,"satisfactionScore":null}-->
Remplace les "null" par les vraies valeurs quand elles sont connues. Pour les ascenseurs, utilise true/false. Pour les étages, mets le chiffre. Pour rdvConseiller, mets true si accepté, false si refusé.`;

    // ─── PARTIE DYNAMIQUE ───
    const dynamicPart = `# ÉTAT DU PARCOURS (Source de vérité — NE PAS redemander ce qui est ✅)
## Coordonnées
${leadData.prenom || leadData.nom ? '✅ Identité : ' + (leadData.prenom || '') + ' ' + (leadData.nom || '') : '❌ Nom : À collecter'}
${leadData.telephone ? '✅ Tél : ' + leadData.telephone : '❌ Tél : À collecter'}
${leadData.email ? '✅ Email : ' + leadData.email : '❌ Email : À collecter'}
${leadData.creneauRappel ? '✅ Créneau rappel : ' + leadData.creneauRappel : '❌ Créneau rappel : À collecter (après récap)'}

## Logement Départ 🏠
${p.villeDepart ? '✅ Ville départ : ' + p.villeDepart + (p.codePostalDepart ? ' (' + p.codePostalDepart + ')' : '') : '❌ Ville départ : À collecter (étape 1)'}
${p.typeHabitationDepart ? '✅ Type départ : ' + p.typeHabitationDepart : '❌ Type départ : À collecter (étape 2)'}
${(p.etageDepart !== undefined || p.etage !== undefined) ? '✅ Étage départ : ' + (p.etageDepart ?? p.etage) : '❌ Étage départ : À collecter (étape 2)'}
${(p.ascenseurDepart !== undefined || p.ascenseur !== undefined) ? '✅ Ascenseur départ : ' + ((p.ascenseurDepart ?? p.ascenseur) ? 'Oui' : 'Non') : '❌ Ascenseur départ : À collecter (étape 2)'}
${p.typeEscalierDepart ? '✅ Escalier départ : ' + p.typeEscalierDepart : ''}
${p.gabaritAscenseurDepart ? '✅ Gabarit asc. départ : ' + p.gabaritAscenseurDepart : ''}
${p.stationnementDepart ? '✅ Stationnement départ : ' + p.stationnementDepart : '❌ Stationnement départ : À collecter (étape 2)'}

## Logement Arrivée 📦
${p.villeArrivee ? '✅ Ville arrivée : ' + p.villeArrivee + (p.codePostalArrivee ? ' (' + p.codePostalArrivee + ')' : '') : '❌ Ville arrivée : À collecter (étape 1)'}
${p.typeHabitationArrivee ? '✅ Type arrivée : ' + p.typeHabitationArrivee : '❌ Type arrivée : À collecter (étape 3)'}
${p.etageArrivee !== undefined ? '✅ Étage arrivée : ' + p.etageArrivee : '❌ Étage arrivée : À collecter (étape 3)'}
${p.ascenseurArrivee !== undefined ? '✅ Ascenseur arrivée : ' + (p.ascenseurArrivee ? 'Oui' : 'Non') : '❌ Ascenseur arrivée : À collecter (étape 3)'}
${p.typeEscalierArrivee ? '✅ Escalier arrivée : ' + p.typeEscalierArrivee : ''}
${p.gabaritAscenseurArrivee ? '✅ Gabarit asc. arrivée : ' + p.gabaritAscenseurArrivee : ''}
${p.stationnementArrivee ? '✅ Stationnement arrivée : ' + p.stationnementArrivee : '❌ Stationnement arrivée : À collecter (étape 3)'}

## Projet
${volume > 0 ? '✅ Volume : ' + volume + ' m3' : '❌ Volume : À collecter (étape 4)'}
${p.dateSouhaitee ? '✅ Date souhaitée : ' + p.dateSouhaitee : '❌ Date : À collecter (étape 4)'}
${p.formule ? '✅ Formule : ' + p.formule : '❌ Formule : À collecter (étape 5)'}
${p.rdvConseiller === true ? '✅ Visite conseiller : Acceptée' : p.rdvConseiller === false ? '✅ Visite conseiller : Refusée' : '❌ Visite conseiller : À proposer (étape 6)'}
${p.creneauVisite ? '✅ Créneau visite : ' + p.creneauVisite : ''}

## Prochaine étape à exécuter
${buildNextStep(leadData, p, hasContact)}`;

    let res = staticPart + '\n\n' + PROMPT_CACHE_SEPARATOR + '\n\n' + dynamicPart;

    if (estimation && hasContact) {
        res += `\n\n# ESTIMATION TARIFAIRE (TTC) — UTILISE UNIQUEMENT CETTE FOURCHETTE
- Fourchette : ${estimation.min} à ${estimation.max} € TTC.
- Formule : ${estimation.formule}.
- INTERDIT de recalculer ou d'afficher un autre montant.`;
    }

    if (entreprise.consignesPersonnalisees) {
        res += `\n\n# CONSIGNES SPÉCIALES DE L'ENTREPRISE\n${entreprise.consignesPersonnalisees}`;
    }

    return res;
}

/**
 * Calcule la prochaine étape à exécuter et l'injecte dans le prompt.
 * Cela guide Claude de façon explicite et évite les sauts d'étapes.
 */
function buildNextStep(leadData: LeadData, p: ProjetDemenagementData, hasContact: boolean): string {
    // Vérifie chaque étape dans l'ordre
    if (!p.villeDepart || !p.villeArrivee) return "ÉTAPE 1 — Demander le trajet complet (ville départ + arrivée avec codes postaux).";
    if (!p.typeHabitationDepart) return "ÉTAPE 2a — Demander le type de logement au DÉPART (Maison ou Appartement ?).";
    if (p.typeHabitationDepart === 'Appartement' && p.etageDepart === undefined && p.etage === undefined) return "ÉTAPE 2b — Demander l'étage au DÉPART.";
    if (p.typeHabitationDepart === 'Appartement' && p.ascenseurDepart === undefined && p.ascenseur === undefined) return "ÉTAPE 2c — Demander s'il y a un ascenseur au DÉPART.";
    if (!p.stationnementDepart) return "ÉTAPE 2d — Demander la facilité de stationnement pour le camion au DÉPART.";
    if (!p.typeHabitationArrivee) return "ÉTAPE 3a — Demander le type de logement à l'ARRIVÉE (Maison ou Appartement ?).";
    if (p.typeHabitationArrivee === 'Appartement' && p.etageArrivee === undefined) return "ÉTAPE 3b — Demander l'étage à l'ARRIVÉE.";
    if (p.typeHabitationArrivee === 'Appartement' && p.ascenseurArrivee === undefined) return "ÉTAPE 3c — Demander s'il y a un ascenseur à l'ARRIVÉE.";
    if (!p.stationnementArrivee) return "ÉTAPE 3d — Demander la facilité de stationnement pour le camion à l'ARRIVÉE.";
    if (!p.volumeEstime) return "ÉTAPE 4a — Demander le volume estimé (m3, liste de meubles, ou surface en m2).";
    if (!p.dateSouhaitee) return "ÉTAPE 4b — Demander la date souhaitée du déménagement.";
    if (!p.formule) return "ÉTAPE 5 — Demander la formule : Éco, Standard ou Luxe.";
    if (p.rdvConseiller === null || p.rdvConseiller === undefined) return "ÉTAPE 6 — Proposer une visite conseiller à domicile.";
    if (!leadData.nom) return "ÉTAPE 7a — Demander le prénom et nom complet.";
    if (!leadData.telephone) return "ÉTAPE 7b — Demander le numéro de téléphone.";
    if (!leadData.email) return "ÉTAPE 7c — Demander l'adresse email.";
    if (!leadData.creneauRappel) return "ÉTAPE 8 — Faire le RÉCAPITULATIF COMPLET avec estimation TTC, demander créneau rappel et satisfaction, puis clôturer chaleureusement.";
    return "CONVERSATION TERMINÉE — Remercier et confirmer que le dossier est transmis. Ne plus poser de questions.";
}

function extractCollectedInfo(lead: LeadData): string[] { return []; }
function hasRdvVisite(lead: LeadData): boolean { return !!lead.projetData?.creneauVisite; }
function hasContactInfo(lead: LeadData): boolean { return !!(lead.nom && (lead.telephone || lead.email)); }
