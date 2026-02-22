import { Metier } from '@prisma/client';
import { getDistanceKm, calculerEstimation } from '../tarification-calculator';

// Séparateur qui indique la frontière static/dynamique pour le cache Anthropic
export const PROMPT_CACHE_SEPARATOR = '\n\n===DYNAMIC_CONTEXT===\n\n';

export interface LeadData {
    prenom?: string;
    nom?: string;
    email?: string;
    telephone?: string;
    creneauRappel?: string;
    satisfaction?: string;
    satisfactionScore?: number;
    projetData: any;
}

export function hasRdvVisite(leadData: LeadData): boolean {
    const p = leadData.projetData || {};
    return p.rdvConseiller === true && !!p.creneauVisite;
}

export function hasContactInfo(leadData: LeadData): boolean {
    return !!(leadData.prenom && leadData.telephone && leadData.email);
}

export interface EntrepriseConfig {
    nom: string;
    nomBot: string;
    zonesIntervention: string[];
    tarifsCustom: any;
    specificites: any;
    documentsCalcul?: string[];
    consignesPersonnalisees?: string;
}

export const VOLUME_CALCULATOR = {
    "meubles": {
        "armoire 1 porte": 1.0, "armoire 2 portes": 2.0, "armoire 3 portes": 2.8,
        "buffet bas": 1.8, "bibliothèque": 2.0, "meuble TV": 1.2,
        "canapé 2 places": 2.0, "canapé 3 places": 3.0, "canapé d'angle": 4.0,
        "fauteuil": 1.0, "carton standard": 0.1, "commode": 1.5,
        "table à manger 6 pers": 2.0, "chaise": 0.3, "bureau": 1.5,
        "lit simple 90": 1.5, "lit 2 places": 2.0, "frigo": 1.0,
        "lave vaisselle": 0.5, "lave linge": 0.5, "TV": 0.5,
        "piano": 2.5, "vélo": 0.8, "divers m3": 1.0
    }
};

export function buildPromptDemenagement(
    entreprise: EntrepriseConfig,
    leadData: LeadData
): string {
    const infosCollectees = extractCollectedInfo(leadData);
    const rdvVisite = hasRdvVisite(leadData);
    const contactDeja = hasContactInfo(leadData);

    const p = leadData.projetData || {};
    const volume = typeof p.volumeEstime === 'number' ? p.volumeEstime : (p.volumeEstime ? parseFloat(String(p.volumeEstime)) : 0);
    const villeDepart = p.villeDepart || '';
    const villeArrivee = p.villeArrivee || '';
    const formuleRaw = (p.formule || '').toString().toLowerCase();
    const formule = ['eco', 'standard', 'luxe'].includes(formuleRaw) ? formuleRaw as 'eco' | 'standard' | 'luxe' : 'standard';
    const distanceKm = getDistanceKm(villeDepart, villeArrivee);
    const estimation = volume > 0 && distanceKm >= 0 && villeDepart && villeArrivee
        ? calculerEstimation({
            volume,
            distanceKm,
            formule,
            etageChargement: typeof p.etage === 'number' ? p.etage : undefined,
            ascenseurChargement: p.ascenseur === true || p.ascenseur === 1 ? 1 : 0,
        })
        : null;

    const staticPart = buildStaticSection(entreprise);
    const dynamicPart = buildDynamicSection(leadData, infosCollectees, estimation, rdvVisite, contactDeja);

    return staticPart + PROMPT_CACHE_SEPARATOR + dynamicPart;
}

function buildStaticSection(entreprise: EntrepriseConfig): string {
    return `# IDENTITÉ
Assistant expert pour ${entreprise.nom}. Bot: ${entreprise.nomBot}.

# LANGUE
Détecter et répondre dans la langue du lead (FR par défaut, EN/ES/AR si détecté).

# FORMATAGE (CRITIQUE)
- INTERDIT : astérisques (*), gras (**), balises HTML.
- AÉRATION : sauter une ligne entre chaque phrase importante.
- CONCISION : messages courts et fluides.
- INTERDIT ABSOLU : écrire "Email de notification envoyé", "Lead qualifié automatiquement", "Fiche envoyée au CRM", "Conversation qualifiée" dans tes réponses.

# ANTI-HALLUCINATION
- NE JAMAIS inventer de données. Si inconnu → demander ou laisser [Inconnu].
- Le récapitulatif = uniquement les infos RÉELLEMENT données dans la conversation.

# MÉMOIRE
- Utiliser toutes les infos données. Ne JAMAIS redemander ce qui est déjà connu.
- DATE FLEXIBLE : une fourchette de dates suffit, ne pas redemander une date précise.

# FICHIERS JOINTS
- Si "[Fichier: nom.ext]" dans le message → extraire les infos utiles et avancer sans redemander.

# CONFIGURATION LOGEMENT
- R+1 = rez-de-chaussée + 1 étage → ne jamais demander si plain-pied.
- Ne poser "plain-pied ou avec étage(s) ?" que si non encore donné.

# ORDRE DES QUESTIONS (STRICT — OBLIGATOIRE)

## ÉTAPE 1 — COLLECTE DU PROJET
1. Trajet (ville départ ➡️ ville arrivée).
2. Type de logement (Maison ou Appartement) + Surface ou nombre de pièces.
3. Configuration au départ :
   - APPARTEMENT : "À quel étage ? Y a-t-il un ascenseur ?"
   - MAISON : "Plain-pied ou avec étage(s) ?" (pas d'ascenseur).
4. Stationnement au départ : "Y a-t-il un stationnement facile pour le camion côté départ ?"
5. VOLUME ESTIMÉ (obligatoire avant de continuer).

## ÉTAPE 2 — PROPOSITION VISITE CONSEILLER
Dès le volume confirmé :
"Souhaiteriez-vous qu'un de nos conseillers se déplace chez vous pour affiner l'estimation et finaliser votre devis ?"

### FLUX VISITE (A) — Lead accepte
A1. "Quel jour vous conviendrait pour cette visite ?"
A2. "Quel créneau vous arrange pour la visite ?" (préciser reconfirmation par le conseiller)
A3. Créneau confirmé → "Pour finaliser, j'ai besoin de vos coordonnées."
    → prénom + nom (ensemble), puis téléphone + email (en un seul message).
    → Lead qualifié. Continuer avec les questions complémentaires.
A4. Questions complémentaires (non encore obtenues) :
    - Configuration à l'arrivée.
    - Stationnement à l'arrivée.
    - Objets lourds/encombrants (piano, moto, scooter...).
    - Date souhaitée du déménagement.
    - Prestation souhaitée (Eco / Standard / Luxe).
A5. RÉCAPITULATIF OBLIGATOIRE (inclure RDV visite).
A6. "Comment avez-vous trouvé cette conversation ?"
❌ INTERDIT : redemander prénom/nom/téléphone/email (déjà collectés en A3).
❌ INTERDIT : étape "créneau de rappel".

### FLUX STANDARD (B) — Lead refuse
B1. Configuration à l'arrivée (adapter Maison/Appartement).
B2. "Et pour l'arrivée, le stationnement est-il facile ?"
B3. "Avez-vous des objets lourds ou encombrants ? (piano, moto, scooter...)"
B4. Date souhaitée du déménagement.
B5. Prestation souhaitée (Eco / Standard / Luxe).
B6. Prénom et nom (ensemble).
B7. "Pour vous recontacter, j'ai besoin de votre numéro de téléphone et de votre adresse email."
B8. RÉCAPITULATIF OBLIGATOIRE avec estimation tarifaire.
B9. "Comment avez-vous trouvé cette conversation ?"
❌ INTERDIT : étape "créneau de rappel".

# AFFICHAGE PRIX
- INTERDIT : montrer la formule de calcul.
- FORMAT : "💰 Estimation : [min] à [max] € (devis définitif après visite technique)".

# VOLUME
- Si inconnu : proposer Surface / 2 ET demander validation.
- Si connu : valider ("C'est noté, XX m³").

# RÉFÉRENCE VOLUMES MEUBLES
${JSON.stringify(VOLUME_CALCULATOR.meubles)}

# FORMULES PRESTATION
- Eco : Transport seul.
- Standard : Eco + Protection fragile + Démontage/Remontage.
- Luxe : Clef en main (emballage complet).

# SCORING B2B
- Surface > 200m² → Signal fort. Budget > 5 000€ → Priorité Haute.

# ENTREPRISE & ZONES
${generatePricingLogic(entreprise)}

# RÉCAPITULATIF LISIBLE
Chaque ligne du récap doit être séparée par une ligne vide (une info par ligne, emoji inclus).

# FORMAT RÉCAPITULATIF (aucun astérisque)
Pour la visite à domicile : afficher "Visite technique" (jamais "créneau de rappel") avec le jour obligatoire (ex: Lundi matin (9h-12h)).
📋 VOTRE PROJET DE DÉMÉNAGEMENT

👤 Client : [Prénom] [Nom]

📍 Trajet : [Départ] ➡️ [Arrivée] (~XXX km)

🏠 Logement départ : [Surface] m² — [Type] — [Configuration]

🏁 Logement arrivée : [Type] — [Configuration]

🅿️ Stationnement départ : [info]

🅿️ Stationnement arrivée : [info]

📦 Volume estimé : ~[XX] m³

🛠️ Prestation : [Eco / Standard / Luxe]

💰 Estimation : [fourchette] € (devis définitif après visite technique)

📅 Date souhaitée : [date]

[📆 Visite technique : [jour] [créneau] — notre conseiller reconfirmera avant la visite.]

📞 Contact : [Téléphone]

📧 Email : [Email]

Notre équipe revient vers vous très rapidement ! 🚀

# EXTRACTION JSON (OBLIGATOIRE À CHAQUE RÉPONSE)
À la toute fin de CHAQUE réponse, ajouter ce bloc sur une seule ligne (invisible pour l'utilisateur) :
"international" = true si destination hors France.
"objetSpeciaux" = liste objets lourds/fragiles mentionnés.
"contraintes" = accès difficile, étage sans ascenseur, rue étroite, etc.
"autorisationStationnement" = true UNIQUEMENT si le client dit qu'une autorisation est requise.
"autorisationStationnementDepart" / "autorisationStationnementArrivee" = true si précisé.
"rdvConseiller" = true si le lead confirme vouloir une visite.
"creneauVisite" = créneau de la visite technique avec le JOUR obligatoire (ex: "Lundi matin (9h-12h)") ; null sinon. Ne jamais mettre le créneau de visite dans creneauRappel.
"monteMeuble" = true UNIQUEMENT si le client mentionne EXPLICITEMENT un monte-meuble. NE JAMAIS déduire depuis les étages ou l'absence d'ascenseur.

<!--DATA:{"villeDepart":null,"villeArrivee":null,"codePostalDepart":null,"codePostalArrivee":null,"surface":null,"nbPieces":null,"volumeEstime":null,"dateSouhaitee":null,"formule":null,"prenom":null,"nom":null,"telephone":null,"email":null,"creneauRappel":null,"satisfaction":null,"objetSpeciaux":[],"monteMeuble":false,"autorisationStationnement":false,"autorisationStationnementDepart":false,"autorisationStationnementArrivee":false,"caveOuStockage":false,"international":false,"contraintes":null,"rdvConseiller":false,"creneauVisite":null}-->`;
}

function buildDynamicSection(
    leadData: LeadData,
    infosCollectees: string[],
    estimation: { min: number; max: number; formule: string } | null,
    rdvVisite: boolean,
    contactDeja: boolean
): string {
    const parts: string[] = [];

    if (estimation) {
        parts.push(`# ESTIMATION CALCULÉE (OBLIGATOIRE)
Utilise EXACTEMENT cette fourchette : ${estimation.min} à ${estimation.max} € (formule ${estimation.formule}, distance prise en compte).`);
    }

    parts.push(`# ÉTAT ACTUEL DU PARCOURS
- Coordonnées collectées : ${contactDeja ? 'OUI — NE PAS redemander nom/prénom/téléphone/email' : 'NON — à collecter (A3 si visite, B7-B8 sinon)'}
- RDV visite confirmé : ${rdvVisite ? 'OUI — inclure dans le récapitulatif' : 'NON — pas encore proposé ou refusé'}`);

    parts.push(`# PARCOURS DE QUALIFICATION
${generateQualificationFlow(leadData, infosCollectees)}`);

    parts.push(`# INFORMATIONS COLLECTÉES
${formatLeadData(leadData, infosCollectees)}`);

    return parts.join('\n\n');
}

/**
 * HELPER FUNCTIONS
 */

function extractCollectedInfo(leadData: LeadData): string[] {
    const collected: string[] = [];
    if (leadData.prenom) collected.push('prénom');
    if (leadData.nom) collected.push('nom');
    if (leadData.email) collected.push('email');
    if (leadData.telephone) collected.push('téléphone');

    const p = leadData.projetData || {};
    if (p.villeDepart) collected.push('ville départ');
    if (p.villeArrivee) collected.push('ville arrivée');
    if (p.volumeEstime || p.surface) collected.push('volume');
    if (p.dateSouhaitee) collected.push('date');
    if (p.formule) collected.push('formule');
    if (leadData.creneauRappel) collected.push('rappel');
    if (p.rdvConseiller === true) collected.push('rdv visite');
    if (p.creneauVisite) collected.push('créneau visite');

    return collected;
}

function generateQualificationFlow(leadData: LeadData, infos: string[]): string {
    const p = leadData.projetData || {};
    const hasRdv = p.rdvConseiller === true;

    const steps = [
        { label: "1. Villes", key: "ville" },
        { label: "2. Logement", key: "logement" },
        { label: "3. Volume", key: "volume" },
        { label: "4. Visite conseiller", key: "rdv visite", optional: true },
        { label: "5. Créneau visite", key: "créneau visite", onlyIf: hasRdv },
        { label: "6. Identité", key: "prénom" },
        { label: "7. Contact", key: "téléphone" },
        { label: "8. Prestation", key: "formule" },
        { label: "9. Date", key: "date" },
    ];

    return steps
        .filter(s => !('onlyIf' in s) || s.onlyIf)
        .map(s => {
            const isDone = infos.some(i => s.label.toLowerCase().includes(i) || i === s.key);
            const suffix = s.optional ? ' (optionnel)' : '';
            return `${isDone ? '✅' : '⏳'} ${s.label}${suffix}`;
        }).join('\n');
}

function formatLeadData(leadData: LeadData, infos: string[]): string {
    if (infos.length === 0) return "Aucune donnée collectée.";
    return JSON.stringify({
        personnel: { prenom: leadData.prenom, nom: leadData.nom, contact: leadData.email || leadData.telephone },
        projet: leadData.projetData
    }, null, 2);
}

function generatePricingLogic(entreprise: EntrepriseConfig): string {
    let logic = `Zones principales : ${entreprise.zonesIntervention.join(', ')}\n`;
    logic += `RÈGLE HORS ZONE : mentionner brièvement UNE FOIS, puis continuer la qualification. TOUJOURS collecter email + téléphone. Le commercial humain décide.\n`;
    if (entreprise.consignesPersonnalisees) {
        logic += `\nCONSIGNES SPÉCIFIQUES :\n${entreprise.consignesPersonnalisees}`;
    }
    return logic;
}
