import { calculerEstimation } from '../tarification-calculator';
import { getDistanceKmWithFallback } from '../../../services/distance.service';

// Séparateur qui indique la frontière static/dynamique pour le cache Anthropic
export const PROMPT_CACHE_SEPARATOR = '\n\n===DYNAMIC_CONTEXT===\n\n';

export interface ProjetDemenagementData {
    villeDepart?: string;
    villeArrivee?: string;
    codePostalDepart?: string;
    codePostalArrivee?: string;
    typeHabitationDepart?: 'Maison' | 'Appartement';
    typeHabitationArrivee?: 'Maison' | 'Appartement';
    surface?: number;
    nbPieces?: number;
    etage?: number;
    ascenseur?: boolean;
    stationnementDepart?: string;
    typeEscalierDepart?: string;
    gabaritAscenseurDepart?: 'petit' | 'moyen' | 'grand';
    accesDifficileDepart?: boolean;
    monteMeubleDepart?: boolean;
    autorisationStationnementDepart?: boolean;
    etageArrivee?: number;
    ascenseurArrivee?: boolean;
    stationnementArrivee?: string;
    typeEscalierArrivee?: string;
    gabaritAscenseurArrivee?: 'petit' | 'moyen' | 'grand';
    accesDifficileArrivee?: boolean;
    monteMeubleArrivee?: boolean;
    autorisationStationnementArrivee?: boolean;
    volumeEstime?: number;
    volumeCalcule?: boolean;
    dateSouhaitee?: string;
    formule?: 'eco' | 'standard' | 'luxe';
    objetSpeciaux?: string[];
    monteMeuble?: boolean;
    autorisationStationnement?: boolean;
    caveOuStockage?: boolean;
    international?: boolean;
    contraintes?: string;
    rdvConseiller?: boolean;
    creneauVisite?: string;
}

export interface LeadData {
    prenom?: string;
    nom?: string;
    email?: string;
    telephone?: string;
    creneauRappel?: string;
    satisfaction?: string;
    satisfactionScore?: number;
    projetData: ProjetDemenagementData;
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
    email?: string;
    telephone?: string;
    zonesIntervention: string[];
    tarifsCustom?: Record<string, unknown>;
    specificites?: Record<string, unknown>;
    documentsCalcul?: string[];
    consignesPersonnalisees?: string;
}

// Référence courte injectée dans le prompt (top 15)
export const VOLUME_REFERENCE: Record<string, number> = {
    'armoire 2 portes': 2.0,
    'armoire 3 portes': 2.8,
    'bibliothèque': 2.0,
    'canapé 2 places': 2.0,
    'canapé 3 places': 3.0,
    "canapé d'angle": 4.0,
    'fauteuil': 1.0,
    'carton standard': 0.1,
    'commode': 1.5,
    'table à manger 6 pers': 2.0,
    'bureau': 1.5,
    'lit 2 places': 2.0,
    'frigo': 1.0,
    'piano': 2.5,
    'vélo': 0.8,
};

// Table complète pour le calcul programmatique (non injectée dans le prompt)
export const VOLUME_CALCULATOR: Record<string, number> = {
    ...VOLUME_REFERENCE,
    'armoire 1 porte': 1.0,
    'buffet bas': 1.8,
    'meuble TV': 1.2,
    'chaise': 0.3,
    'lit simple 90': 1.5,
    'lave vaisselle': 0.5,
    'lave linge': 0.5,
    'TV': 0.5,
    'divers m3': 1.0,
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

    return staticPart + PROMPT_CACHE_SEPARATOR + dynamicPart;
}

function formatContactCloture(entreprise: EntrepriseConfig): string {
    const parts: string[] = [];
    if (entreprise.telephone) parts.push(`au ${entreprise.telephone}`);
    if (entreprise.email) parts.push(`par mail à ${entreprise.email}`);
    return parts.length > 0 ? parts.join(' ou ') : 'directement (coordonnées disponibles sur notre site)';
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

# UNE SEULE QUESTION À LA FOIS (CRITIQUE)
- Ne JAMAIS poser deux questions distinctes dans le même message (ex: stationnement ET objets lourds).
- Si le lead répond "Oui" ou "Non" de façon ambiguë, ne pas supposer — poser UNE question claire, attendre la réponse, puis passer à la suivante.

# ANTI-RÉPÉTITION
- Ne JAMAIS répéter une question déjà posée. Si le lead a répondu (même "Non"), considérer la question comme traitée et passer à la suivante.
- Si creneauVisite complet (jour + créneau) → NE PLUS redemander jour ou créneau de visite.
- Si creneauRappel ET satisfaction sont déjà collectés → message de clôture UNIQUEMENT. NE JAMAIS redemander le créneau.
- Si le lead dit "passe à la suite", "tu bloques", "next", "arrête", "continue", "vas-y" → avancer immédiatement sans redemander.

# FICHIERS JOINTS
- Si "[Fichier: nom.ext]" avec "Contenu:" dans le message → LIRE le contenu fourni et extraire les infos utiles (meubles, volume, etc.). Avancer sans redemander.
- Si seul "[Fichier: nom.ext]" sans contenu → demander au lead de coller le contenu ou de décrire les meubles.

# CONFIGURATION LOGEMENT
- R+1 = rez-de-chaussée + 1 étage → ne jamais demander si plain-pied.
- Ne poser "plain-pied ou avec étage(s) ?" que si non encore donné.

# ORDRE DES QUESTIONS (STRICT — OBLIGATOIRE)

RÈGLE PRIORITAIRE : NE JAMAIS donner l'estimation tarifaire avant d'avoir collecté prénom, nom, téléphone et email.
PREMIER MESSAGE : Court et chaleureux. NE PAS demander prénom/nom/téléphone/email en premier. Commencer par le trajet.
Exemple : "Bonjour 👋 Je peux vous donner une estimation rapide pour votre déménagement 🚚 Pour cela, j'ai juste besoin de quelques infos sur votre projet afin de calculer un tarif adapté. Commençons simplement : 📍 D'où déménagez-vous ? (ville + code postal si possible)"

## ÉTAPE 1 — COLLECTE DU PROJET
Pour chaque adresse (départ ET arrivée), collecter OBLIGATOIREMENT : ville, code postal, type habitation (Maison/Appartement), accès (stationnement + configuration étage/ascenseur + facilité d'accès).
1. Trajet (ville départ ➡️ ville arrivée) — avec code postal si possible.
2. Type de logement (Maison ou Appartement) + Surface ou nombre de pièces.
3. Configuration au départ :
   - APPARTEMENT : "À quel étage ? Y a-t-il un ascenseur ?"
   - MAISON : "Plain-pied ou avec étage(s) ?" (pas d'ascenseur).
4. Stationnement au départ : "Y a-t-il un stationnement facile pour le camion côté départ ?"
5. VOLUME ESTIMÉ (obligatoire avant de continuer).
6. Si au départ OU à l'arrivée il y a un ou plusieurs étages (etage > 0) :
   - Demander si tout le mobilier passe facilement par la cage d'escalier ou l'ascenseur.
   - Demander le type de cage d'escalier : droite ou en colimaçon, large ou étroite.
   - Si ascenseur présent : demander le gabarit de l'ascenseur (petit, moyen, grand).
   - Si le client indique que le mobilier ne passe pas ou passe difficilement → noter un accès difficile pour l'adresse concernée.

## ÉTAPE 2 — PROPOSITION VISITE CONSEILLER
Dès le volume confirmé :
"Souhaiteriez-vous qu'un de nos conseillers se déplace chez vous pour affiner l'estimation et finaliser votre devis ?"

### FLUX VISITE (A) — Lead accepte
CRÉNEAU VISITE = jour + horaire pour la visite technique (ex: "Mardi matin (9h-12h)") — à confirmer par le conseiller.
A1. "Quel jour vous conviendrait pour cette visite ?"
A2. "Quel créneau vous arrange pour la visite ? (Matin 9h-12h, Après-midi 14h-18h, etc.)"
→ Une seule fois. Si le lead a déjà donné jour ET créneau → NE PAS redemander.
A3. Créneau confirmé → "Pour finaliser, j'ai besoin de vos coordonnées."
    → prénom + nom (ensemble), puis téléphone + email (en un seul message).
    → Lead qualifié. Continuer avec les questions complémentaires.
A4. Questions complémentaires (non encore obtenues) :
    - Configuration à l'arrivée.
    - Stationnement à l'arrivée.
    - Objets lourds/encombrants (piano, moto, scooter...).
    - Date souhaitée du déménagement.
    - Prestation souhaitée (Eco / Standard / Luxe).
A5. RÉCAPITULATIF OBLIGATOIRE (inclure RDV visite). FAIRE LE RÉCAP AVANT toute autre question.
A5b. CRÉNEAU RAPPEL = quand le commercial peut recontacter le lead (Matin, Après-midi, Soir, Indifférent). "Quel créneau vous arrange pour être recontacté ?" — NE PAS confondre avec le créneau de visite. NE PAS poser si pas de téléphone.
A6. "Comment avez-vous trouvé cette conversation ?"
❌ INTERDIT : redemander prénom/nom/téléphone/email (déjà collectés en A3).

### FLUX STANDARD (B) — Lead refuse
ORDRE : stationnement départ (si pas encore collecté) AVANT coordonnées.
B0. Si stationnement départ manquant : "Y a-t-il un stationnement facile pour le camion côté départ ?" — puis B1.
B1. Configuration à l'arrivée (adapter Maison/Appartement).
B2. "Et pour l'arrivée, le stationnement est-il facile ?"
B3. "Avez-vous des objets lourds ou encombrants ? (piano, moto, scooter...)"
B4. Date souhaitée du déménagement.
B5. Prestation souhaitée (Eco / Standard / Luxe).
B6. Prénom et nom (ensemble).
B7. "Pour vous recontacter, j'ai besoin de votre numéro de téléphone et de votre adresse email."
B8. RÉCAPITULATIF OBLIGATOIRE avec estimation tarifaire. FAIRE LE RÉCAP AVANT toute autre question.
B8b. CRÉNEAU RAPPEL = quand le commercial peut recontacter le lead. "Quel créneau vous arrange pour être recontacté ?" — NE PAS confondre avec le créneau de visite. NE PAS poser si pas de téléphone.
B9. "Comment avez-vous trouvé cette conversation ?"

# AFFICHAGE PRIX
- INTERDIT : montrer la formule de calcul.
- FORMAT : "💰 Estimation : [min] à [max] € (indicatif — affinage avec le service commercial)".

# VOLUME (OBLIGATOIRE avant estimation)
- TOUJOURS demander le volume ou une validation. La surface seule ne suffit pas.
- Si inconnu : proposer "Avec XX m², on estime ~YY m³. Confirmez-vous ?" et attendre la validation.
- Si connu : valider ("C'est noté, XX m³") puis continuer.

# RÉFÉRENCE VOLUMES MEUBLES
${JSON.stringify(VOLUME_REFERENCE, null, 0)}

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
- Si téléphone et email sont connus : afficher 📞 Contact : [numéro] et 📧 Email : [email]. JAMAIS "À confirmer" si les données existent.
- Stationnement : utiliser la valeur collectée (Facile, Difficile, etc.). Si "Oui" → "Facile".
- Pour la visite à domicile : afficher "Visite technique" (jamais "créneau de rappel") avec le jour obligatoire (ex: Lundi matin (9h-12h)).
📋 VOTRE PROJET DE DÉMÉNAGEMENT

👤 Client : [Prénom] [Nom]

📍 Trajet : [Départ] ➡️ [Arrivée] (~XXX km)

🏠 Logement départ : [Surface] m² — [Type] — [Configuration]

🏁 Logement arrivée : [Type] — [Configuration]

🅿️ Stationnement départ : [info]

🅿️ Stationnement arrivée : [info]

📦 Volume estimé : ~[XX] m³

🛠️ Prestation : [Eco / Standard / Luxe]

💰 Estimation : [fourchette] € (indicatif — affinage avec le service commercial)

📅 Date souhaitée : [date]

[📆 Visite technique : [jour] [créneau] — notre conseiller reconfirmera avant la visite.]

📞 Contact : [Téléphone]

📧 Email : [Email]

Notre équipe revient vers vous très rapidement ! 🚀

# MESSAGE DE CLÔTURE (OBLIGATOIRE — après récapitulatif et satisfaction)
À la fin de la conversation, conclure TOUJOURS par un message de clôture incluant :
1. Remerciement au nom de ${entreprise.nom}
2. "Vous allez être recontacté rapidement"
3. Coordonnées pour nous contacter : ${formatContactCloture(entreprise)}
4. Mention confidentialité : "Vos informations personnelles ne seront en aucun cas divulguées et restent strictement confidentielles."
Exemple : "${entreprise.nom} vous remercie. Vous allez être recontacté rapidement. Si vous avez la moindre question, n'hésitez pas à nous contacter ${formatContactCloture(entreprise)}. Vos données personnelles restent strictement confidentielles et ne seront jamais divulguées."

# EXTRACTION JSON (OBLIGATOIRE À CHAQUE RÉPONSE)
À la toute fin de CHAQUE réponse, ajouter ce bloc sur une seule ligne (invisible pour l'utilisateur).
Pour les adresses : villeDepart/villeArrivee = nom de ville RÉEL (jamais "Vous", "Affiner" ou mot générique). codePostalDepart/codePostalArrivee = code postal (5 chiffres FR, ou format local pour international ex. Oran 31000). Si le lead ne donne pas le CP, le résoudre via la ville si possible (ex. Drancy → 93700) et l'inclure dans les données extraites. Même pour international (ex. Drancy-Oran), la distance est calculée et prise en compte.
typeHabitationDepart/typeHabitationArrivee = "Maison" ou "Appartement" si connu.
stationnementDepart/stationnementArrivee = détail si donné. "Oui" → "Facile", "Non" → "Difficile". Ex: "Facile", "Facile (résidence + 20 m à pied)", "Difficile", "Autorisation requise".
"international" = true si destination hors France.
"objetSpeciaux" = liste objets lourds/fragiles mentionnés.
"contraintes" = accès difficile, étage sans ascenseur, rue étroite, etc.
"autorisationStationnement" = true UNIQUEMENT si le client dit qu'une autorisation est requise.
"autorisationStationnementDepart" / "autorisationStationnementArrivee" = true si précisé.
"typeEscalierDepart" / "typeEscalierArrivee" = description courte (ex: "droit large", "colimaçon étroit") si donnée.
"gabaritAscenseurDepart" / "gabaritAscenseurArrivee" = "petit", "moyen" ou "grand" si précisé.
"accesDifficileDepart" / "accesDifficileArrivee" = true si le client indique que le mobilier ne passe pas ou passe difficilement par les accès (escalier/ascenseur).
"monteMeubleDepart" / "monteMeubleArrivee" = true si un monte-meuble est explicitement prévu au départ et/ou à l'arrivée.
"etage" = numéro d'étage au départ (0 = RDC, 1 = 1er, 2 = 2e…). Ne remplir que pour le logement de départ sauf si un seul logement décrit.
"ascenseur" = true si ascenseur présent au départ, false sinon.
"rdvConseiller" = true si le lead confirme vouloir une visite.
"creneauVisite" = jour + créneau horaire pour la visite technique (ex: "Mardi matin (9h-12h)") ; null sinon. NE JAMAIS mettre dans creneauRappel.
"creneauRappel" = créneau pour que le commercial recontacte le lead (Matin, Après-midi, Soir, Indifférent) — question distincte, posée APRÈS le récap.
"monteMeuble" = true UNIQUEMENT si le client mentionne EXPLICITEMENT un monte-meuble. NE JAMAIS déduire depuis les étages ou l'absence d'ascenseur.
"volumeCalcule" = true UNIQUEMENT si le client a donné la liste détaillée des meubles et que tu as calculé le volume à partir de cette liste (en utilisant le tableau de volumes). false ou absent dans tous les autres cas (volume donné directement par le lead ou estimé depuis la surface sans liste détaillée).

<!--DATA:{"villeDepart":null,"villeArrivee":null,"codePostalDepart":null,"codePostalArrivee":null,"typeHabitationDepart":null,"typeHabitationArrivee":null,"stationnementDepart":null,"stationnementArrivee":null,"surface":null,"nbPieces":null,"volumeEstime":null,"volumeCalcule":null,"etage":null,"ascenseur":null,"dateSouhaitee":null,"formule":null,"prenom":null,"nom":null,"telephone":null,"email":null,"creneauRappel":null,"satisfaction":null,"objetSpeciaux":[],"monteMeuble":false,"autorisationStationnement":false,"autorisationStationnementDepart":false,"autorisationStationnementArrivee":false,"caveOuStockage":false,"international":false,"contraintes":null,"typeEscalierDepart":null,"typeEscalierArrivee":null,"gabaritAscenseurDepart":null,"gabaritAscenseurArrivee":null,"accesDifficileDepart":false,"accesDifficileArrivee":false,"monteMeubleDepart":false,"monteMeubleArrivee":false,"rdvConseiller":false,"creneauVisite":null}-->`;
}

function buildDynamicSection(
    leadData: LeadData,
    infosCollectees: string[],
    estimation: { min: number; max: number; formule: string } | null,
    rdvVisite: boolean,
    contactDeja: boolean,
    distanceKm?: number
): string {
    const parts: string[] = [];
    const p = leadData.projetData || {};

    if (estimation) {
        parts.push(`# ESTIMATION CALCULÉE (OBLIGATOIRE)
Utilise EXACTEMENT cette fourchette : ${estimation.min} à ${estimation.max} € (formule ${estimation.formule}, distance prise en compte).
NE JAMAIS inventer ou modifier cette fourchette. L'inclure dans le récapitulatif.`);
    }

    if (distanceKm !== undefined && distanceKm > 0) {
        parts.push(`# DISTANCE CALCULÉE
Utiliser cette valeur dans le récapitulatif : ~${distanceKm} km (dans "📍 Trajet : [Départ] ➡️ [Arrivée] (~${distanceKm} km)").`);
    }

    const pasDeTelephone = !leadData.telephone && !!leadData.email;
    parts.push(`# ÉTAT ACTUEL DU PARCOURS
- Coordonnées collectées : ${contactDeja ? 'OUI — NE JAMAIS redemander. Afficher dans le récap : 📞 Contact : ' + (leadData.telephone || '') + ' — 📧 Email : ' + (leadData.email || '') : 'NON — à collecter (A3 si visite, B7-B8 sinon)'}
- RDV visite confirmé : ${rdvVisite ? 'OUI — inclure dans le récapitulatif' : 'NON — pas encore proposé ou refusé'}
${pasDeTelephone ? '- Pas de téléphone (email uniquement) → NE PAS demander le créneau de recontact (A5b/B8b)' : ''}
${leadData.creneauRappel ? '- Créneau de recontact DÉJÀ collecté (' + leadData.creneauRappel + ') → NE PAS redemander. Passer directement au message de clôture.' : ''}
${(leadData.projetData?.creneauVisite) ? '- Créneau visite DÉJÀ collecté (' + leadData.projetData.creneauVisite + ') → NE PAS redemander jour/créneau visite.' : ''}
${p.stationnementDepart ? '- Stationnement départ DÉJÀ collecté (' + p.stationnementDepart + ') → NE PAS redemander.' : ''}
${p.stationnementArrivee ? '- Stationnement arrivée DÉJÀ collecté (' + p.stationnementArrivee + ') → NE PAS redemander.' : ''}
${leadData.satisfaction ? '- Satisfaction DÉJÀ collectée → NE PAS redemander. Message de clôture UNIQUEMENT.' : ''}`);

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
    if (leadData.satisfaction) collected.push('satisfaction');

    const p = leadData.projetData || {};
    if (p.villeDepart) collected.push('ville départ');
    if (p.villeArrivee) collected.push('ville arrivée');
    if (p.typeHabitationDepart) collected.push('type départ');
    if (p.typeHabitationArrivee) collected.push('type arrivée');
    if (p.stationnementDepart) collected.push('accès départ');
    if (p.stationnementArrivee) collected.push('accès arrivée');
    // Volume = uniquement si explicitement donné ou validé (surface seule ne suffit pas)
    if (p.volumeEstime && (typeof p.volumeEstime === 'number' || parseFloat(String(p.volumeEstime)) > 0)) collected.push('volume');
    if (p.dateSouhaitee) collected.push('date');
    if (p.formule) collected.push('formule');
    if (leadData.creneauRappel) collected.push('rappel');
    if (p.rdvConseiller === true) collected.push('rdv visite');
    if (p.creneauVisite) collected.push('créneau visite');

    return collected;
}

function computeSupplementMonteMeuble(p: ProjetDemenagementData): number {
    if (p.monteMeubleDepart && p.monteMeubleArrivee) return 350;
    if (p.monteMeubleDepart || p.monteMeubleArrivee || p.monteMeuble) return 180;
    return 0;
}

function generateQualificationFlow(leadData: LeadData, infos: string[]): string {
    const p = leadData.projetData ?? {};
    const rdvRefused = p.rdvConseiller === false;

    const steps: Array<{ label: string; done: boolean; skip?: boolean }> = [
        { label: '1. Trajet (départ + arrivée)', done: !!(p.villeDepart && p.villeArrivee) },
        { label: '2. Type logement + surface/pièces', done: !!(p.typeHabitationDepart && (p.surface || p.nbPieces)) },
        { label: '3. Configuration + accès départ', done: !!p.stationnementDepart },
        { label: '4. Volume estimé (validé)', done: !!(p.volumeEstime && Number(p.volumeEstime) > 0) },
        { label: '5. Visite conseiller (proposée)', done: typeof p.rdvConseiller === 'boolean' },
        { label: '6. Créneau visite', done: !!p.creneauVisite, skip: rdvRefused },
        { label: '7. Configuration + accès arrivée', done: !!(p.typeHabitationArrivee && p.stationnementArrivee) },
        { label: '8. Objets spéciaux (vérifiés)', done: Array.isArray(p.objetSpeciaux) },
        { label: '9. Date souhaitée', done: !!p.dateSouhaitee },
        { label: '10. Prestation (Eco/Standard/Luxe)', done: !!p.formule },
        { label: '11. Identité (prénom + nom)', done: !!(leadData.prenom && leadData.nom) },
        { label: '12. Contact (téléphone + email)', done: !!(leadData.telephone && leadData.email) },
        { label: '13. Créneau rappel', done: !!leadData.creneauRappel },
        { label: '14. Satisfaction', done: !!leadData.satisfaction },
    ];

    const lines: string[] = [];
    for (const step of steps) {
        if (step.skip) continue;
        lines.push(`${step.done ? '✅' : '⏳'} ${step.label}`);
    }
    return lines.join('\n');
}

function formatLeadData(leadData: LeadData, infos: string[]): string {
    if (infos.length === 0) return 'Aucune donnée collectée.';

    const isPopulated = (v: unknown): boolean =>
        v !== null && v !== undefined && v !== false && v !== '' &&
        !(Array.isArray(v) && v.length === 0);

    const projetFiltered = Object.fromEntries(
        Object.entries(leadData.projetData ?? {}).filter(([, v]) => isPopulated(v))
    );

    const personnelFiltered = Object.fromEntries(
        Object.entries({
            prenom: leadData.prenom,
            nom: leadData.nom,
            email: leadData.email,
            telephone: leadData.telephone,
            creneauRappel: leadData.creneauRappel,
            satisfaction: leadData.satisfaction,
        }).filter(([, v]) => isPopulated(v))
    );

    return JSON.stringify({ personnel: personnelFiltered, projet: projetFiltered }, null, 2);
}

function generatePricingLogic(entreprise: EntrepriseConfig): string {
    let logic = `Zones principales : ${entreprise.zonesIntervention.join(', ')}\n`;
    logic += `RÈGLE HORS ZONE : mentionner brièvement UNE FOIS, puis continuer la qualification. TOUJOURS collecter email + téléphone. Le commercial humain décide.\n`;
    if (entreprise.consignesPersonnalisees) {
        logic += `\nCONSIGNES SPÉCIFIQUES :\n${entreprise.consignesPersonnalisees}`;
    }
    return logic;
}
