import { calculerEstimation } from '../tarification-calculator';
import { getDistanceKmWithFallback } from '../../../services/distance.service';

// ─────────────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjetDemenagementData {
    // Adresses
    villeDepart?: string;
    villeArrivee?: string;
    codePostalDepart?: string;
    codePostalArrivee?: string;
    // Logements
    typeHabitationDepart?: 'Maison' | 'Appartement';
    typeHabitationArrivee?: 'Maison' | 'Appartement';
    surface?: number;
    nbPieces?: number;
    // Accès départ
    etage?: number;
    ascenseur?: boolean;
    stationnementDepart?: string;
    typeEscalierDepart?: string;
    gabaritAscenseurDepart?: 'petit' | 'moyen' | 'grand';
    accesDifficileDepart?: boolean;
    monteMeubleDepart?: boolean;
    autorisationStationnementDepart?: boolean;
    // Accès arrivée
    etageArrivee?: number;
    ascenseurArrivee?: boolean;
    stationnementArrivee?: string;
    typeEscalierArrivee?: string;
    gabaritAscenseurArrivee?: 'petit' | 'moyen' | 'grand';
    accesDifficileArrivee?: boolean;
    monteMeubleArrivee?: boolean;
    autorisationStationnementArrivee?: boolean;
    // Volume & projet
    volumeEstime?: number;
    volumeCalcule?: boolean;
    dateSouhaitee?: string;
    formule?: 'eco' | 'standard' | 'luxe';
    // Divers
    objetSpeciaux?: string[];
    monteMeuble?: boolean;
    autorisationStationnement?: boolean;
    caveOuStockage?: boolean;
    international?: boolean;
    contraintes?: string;
    // RDV
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

type Formule = 'eco' | 'standard' | 'luxe';

export interface Estimation {
    min: number;
    max: number;
    formule: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

/** Séparateur static / dynamique pour le cache Anthropic */
export const PROMPT_CACHE_SEPARATOR = '\n\n===DYNAMIC_CONTEXT===\n\n';

/**
 * Top 15 meubles injectés dans le prompt (référence rapide pour le LLM).
 * Le calcul réel du volume est fait en TypeScript via calculateVolume().
 */
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

/** Table complète pour le calcul programmatique — non injectée dans le prompt */
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

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS PUBLICS
// ─────────────────────────────────────────────────────────────────────────────

export function hasRdvVisite(leadData: LeadData): boolean {
    return leadData.projetData?.rdvConseiller === true && !!leadData.projetData?.creneauVisite;
}

export function hasContactInfo(leadData: LeadData): boolean {
    return !!(leadData.prenom && leadData.telephone && leadData.email);
}

/**
 * Calcule le volume total à partir d'une liste de meubles et quantités.
 * Utiliser cette fonction côté serveur — ne pas laisser le LLM faire ce calcul.
 * @example calculateVolume({ 'canapé 3 places': 1, 'carton standard': 20 }) // → 5.0
 */
export function calculateVolume(items: Record<string, number>): number {
    return Object.entries(items).reduce((total, [meuble, qty]) => {
        return total + (VOLUME_CALCULATOR[meuble] ?? 0) * qty;
    }, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
//  BUILDER PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export async function buildPromptDemenagement(
    entreprise: EntrepriseConfig,
    leadData: LeadData,
): Promise<string> {
    const { estimation, distanceKm } = await computeEstimationAndDistance(leadData.projetData);

    const staticPart = buildStaticSection(entreprise);
    const dynamicPart = buildDynamicSection(leadData, estimation, distanceKm);

    return staticPart + PROMPT_CACHE_SEPARATOR + dynamicPart;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CALCUL ESTIMATION (100% serveur, zéro LLM)
// ─────────────────────────────────────────────────────────────────────────────

async function computeEstimationAndDistance(
    p: ProjetDemenagementData,
): Promise<{ estimation: Estimation | null; distanceKm: number | null }> {
    const villeDepart = p.villeDepart ?? '';
    const villeArrivee = p.villeArrivee ?? '';
    const volume = p.volumeEstime ? Number(p.volumeEstime) : 0;

    if (!villeDepart || !villeArrivee) return { estimation: null, distanceKm: null };

    const distanceKm = await getDistanceKmWithFallback(villeDepart, villeArrivee);
    if (distanceKm < 0) return { estimation: null, distanceKm: null };

    if (!volume) return { estimation: null, distanceKm };

    const formule: Formule = (['eco', 'standard', 'luxe'] as const).includes(p.formule as Formule)
        ? (p.formule as Formule)
        : 'standard';

    const supplementMonteMeuble = computeSupplementMonteMeuble(p);
    const supplementObjetsLourds = Array.isArray(p.objetSpeciaux) && p.objetSpeciaux.length > 0 ? 150 : 0;

    const estimation = calculerEstimation({
        volume,
        distanceKm,
        formule,
        etageChargement: typeof p.etage === 'number' ? p.etage : undefined,
        ascenseurChargement: p.ascenseur === true ? 1 : 0,
        supplementMonteMeuble,
        supplementObjetsLourds,
    });

    return { estimation, distanceKm };
}

function computeSupplementMonteMeuble(p: ProjetDemenagementData): number {
    if (p.monteMeubleDepart && p.monteMeubleArrivee) return 350;
    if (p.monteMeubleDepart || p.monteMeubleArrivee || p.monteMeuble) return 180;
    return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION STATIQUE — mise en cache Anthropic
//  Ne change que si la config entreprise change.
// ─────────────────────────────────────────────────────────────────────────────

function buildStaticSection(entreprise: EntrepriseConfig): string {
    const contact = formatContact(entreprise);

    return `# IDENTITÉ
Assistant expert pour ${entreprise.nom}. Bot : ${entreprise.nomBot}.

# LANGUE
Détecter et répondre dans la langue du lead (FR par défaut, EN/ES/AR si détecté).

# FORMATAGE
- INTERDIT : astérisques (*), gras (**), balises HTML.
- Sauter une ligne entre chaque information importante.
- Messages courts et fluides. Une seule idée par message.
- INTERDIT ABSOLU dans les réponses : "Lead qualifié", "Fiche envoyée au CRM", "Email de notification envoyé", "Conversation qualifiée".

# RÈGLES CRITIQUES
1. NE JAMAIS inventer de données. Inconnu → demander ou [Inconnu].
2. NE JAMAIS redemander une information déjà collectée (vérifier # ÉTAT DU PARCOURS avant chaque question).
3. UNE SEULE question par message — attendre la réponse avant d'en poser une autre.
4. NE JAMAIS afficher l'estimation avant d'avoir : prénom, nom, téléphone, email.
5. PREMIER MESSAGE : chaleureux, commencer par le trajet. Jamais par les coordonnées.
   Exemple : "Bonjour 👋 Je peux vous donner une estimation pour votre déménagement 🚚 Commençons : 📍 D'où déménagez-vous ? (ville + code postal si possible)"
6. DATE FLEXIBLE : une fourchette suffit.
7. Si le lead dit "passe à la suite / next / continue / vas-y / arrête" → avancer immédiatement.
8. NE JAMAIS confondre creneauVisite (visite technique chez le lead) et creneauRappel (appel du commercial).
9. Stationnement : si le lead répond "Oui" → noter "Facile". Si "Non" → noter "Difficile".

# GESTION DES FICHIERS JOINTS
- "[Fichier: nom.ext]" avec "Contenu:" → lire, extraire les infos, avancer sans redemander.
- "[Fichier: nom.ext]" sans contenu → demander au lead de coller le contenu ou de décrire les meubles.

# ORDRE DE QUALIFICATION (STRICT)

## ÉTAPE 1 — PROJET
1. Trajet : ville départ ➡️ ville arrivée (code postal si possible).
2. Type habitation (Maison/Appartement) + surface ou nb pièces.
3. Configuration départ :
   - Appartement : "À quel étage ? Y a-t-il un ascenseur ?"
   - Maison : "Plain-pied ou avec étage(s) ?" (jamais demander d'ascenseur pour une maison).
   - Si étage > 0 : "Le mobilier passe-t-il facilement par l'escalier ?" + type (droit/colimaçon, large/étroit).
   - Si ascenseur : "Quel est le gabarit ? (petit, moyen, grand)"
   - Si passage difficile → accesDifficileDepart = true.
4. Stationnement départ.
5. VOLUME ESTIMÉ (obligatoire — surface seule insuffisante).
   Si inconnu : "Avec ~XX m², on estime ~YY m³. Confirmez-vous ?"

## ÉTAPE 2 — VISITE CONSEILLER
Dès le volume confirmé :
"Souhaiteriez-vous qu'un conseiller se déplace chez vous pour affiner l'estimation et finaliser votre devis ?"

### FLUX A — Lead accepte la visite
A1. Quel jour pour la visite ?
A2. Quel créneau ? (Matin 9h-12h / Après-midi 14h-18h…) → NE PAS redemander si déjà obtenu.
A3. "Pour finaliser, j'ai besoin de vos coordonnées." → prénom + nom, puis téléphone + email.
A4. Questions complémentaires (si non encore obtenues) :
    - Configuration arrivée (même logique qu'étape 1).
    - Stationnement arrivée.
    - Objets lourds/encombrants (piano, moto, scooter…).
    - Date souhaitée.
    - Prestation (Eco / Standard / Luxe).
A5. RÉCAPITULATIF complet (inclure RDV visite).
A5b. Créneau rappel (sauf si pas de téléphone) : "Quel créneau pour être recontacté ? (Matin, Après-midi, Soir, Indifférent)"
A6. "Comment avez-vous trouvé cette conversation ?"
❌ INTERDIT : redemander prénom/nom/téléphone/email (collectés en A3).

### FLUX B — Lead refuse la visite
B0. Si stationnement départ manquant : le demander avant de continuer.
B1. Configuration + stationnement arrivée (même logique qu'étape 1).
B2. Objets lourds/encombrants.
B3. Date souhaitée.
B4. Prestation (Eco / Standard / Luxe).
B5. Prénom + nom.
B6. Téléphone + email.
B7. RÉCAPITULATIF complet avec estimation.
B7b. Créneau rappel (sauf si pas de téléphone).
B8. "Comment avez-vous trouvé cette conversation ?"

# AFFICHAGE PRIX
- INTERDIT : montrer la formule ou le détail du calcul.
- FORMAT : "💰 Estimation : [min] à [max] € (indicatif — affinage avec le service commercial)".
- Utiliser UNIQUEMENT la fourchette fournie dans # ESTIMATION CALCULÉE.

# FORMULES PRESTATION
- Eco : Transport seul.
- Standard : Eco + protection fragile + démontage/remontage.
- Luxe : Clef en main (emballage complet).

# RÉFÉRENCE VOLUMES MEUBLES (top 15)
${JSON.stringify(VOLUME_REFERENCE, null, 0)}
Le calcul du volume est effectué automatiquement côté serveur. Attendre la confirmation du lead puis utiliser la valeur fournie dans # ESTIMATION CALCULÉE.

# SCORING B2B
Surface > 200 m² ou budget > 5 000 € → Priorité Haute.

# ZONES & ENTREPRISE
Zones : ${entreprise.zonesIntervention.join(', ')}
Hors zone : mentionner UNE FOIS uniquement, puis continuer la qualification. Le commercial décide.
${entreprise.consignesPersonnalisees ? `\nCONSIGNES SPÉCIFIQUES :\n${entreprise.consignesPersonnalisees}` : ''}

# FORMAT RÉCAPITULATIF (une info par bloc, ligne vide entre chaque, aucun astérisque)
- Coordonnées : afficher EXACTEMENT les valeurs collectées. JAMAIS "À confirmer" si les données existent.
- Stationnement : valeur collectée (Facile / Difficile / détail).
- Visite : afficher jour + créneau (ex: "Lundi matin (9h-12h)"). JAMAIS "créneau de rappel".
- Distance : utiliser la valeur de # DISTANCE CALCULÉE si disponible.

📋 VOTRE PROJET DE DÉMÉNAGEMENT

👤 Client : [Prénom] [Nom]

📍 Trajet : [Départ] ➡️ [Arrivée] (~XXX km)

🏠 Logement départ : [Surface] m² — [Type] — [Configuration]

🏁 Logement arrivée : [Type] — [Configuration]

🅿️ Stationnement départ : [info]

🅿️ Stationnement arrivée : [info]

📦 Volume estimé : ~[XX] m³

🛠️ Prestation : [Eco / Standard / Luxe]

💰 Estimation : [min] à [max] € (indicatif — affinage avec le service commercial)

📅 Date souhaitée : [date]

[📆 Visite technique : [jour] [créneau] — notre conseiller reconfirmera avant la visite.]

📞 Contact : [Téléphone]

📧 Email : [Email]

Notre équipe revient vers vous très rapidement ! 🚀

# MESSAGE DE CLÔTURE (obligatoire — après récap + satisfaction)
"${entreprise.nom} vous remercie. Vous allez être recontacté rapidement. Pour toute question : ${contact}. Vos informations personnelles restent strictement confidentielles et ne seront jamais divulguées."

# EXTRACTION JSON (obligatoire à CHAQUE réponse — invisible utilisateur)
Ajouter en FIN de réponse, sur UNE SEULE ligne, sans modifier les clés ni la structure.
Règles :
- villeDepart/villeArrivee = nom de ville RÉEL. Jamais "Vous" ou mot générique.
- codePostal = 5 chiffres FR ou format local. Résoudre depuis la ville si non donné (ex: Drancy → 93700, Oran → 31000).
- international = true si destination hors France.
- stationnementDepart/Arrivee : "Oui" → "Facile", "Non" → "Difficile". Sinon valeur exacte (ex: "Facile (résidence)", "Autorisation requise").
- monteMeuble/monteMeubleDepart/monteMeubleArrivee = true UNIQUEMENT si le lead le mentionne EXPLICITEMENT.
- autorisationStationnement = true UNIQUEMENT si le lead précise qu'une autorisation est requise.
- creneauVisite = jour + créneau visite technique (ex: "Mardi matin (9h-12h)"). JAMAIS dans creneauRappel.
- creneauRappel = créneau recontact commercial (Matin / Après-midi / Soir / Indifférent). JAMAIS dans creneauVisite.
- volumeCalcule = true UNIQUEMENT si le lead a donné une liste détaillée de meubles utilisée pour calculer le volume.
- accesDifficileDepart/Arrivee = true si mobilier ne passe pas ou passe difficilement.
- etage = numéro étage au départ (0 = RDC). ascenseur = true/false au départ.

<!--DATA:{"villeDepart":null,"villeArrivee":null,"codePostalDepart":null,"codePostalArrivee":null,"typeHabitationDepart":null,"typeHabitationArrivee":null,"stationnementDepart":null,"stationnementArrivee":null,"surface":null,"nbPieces":null,"volumeEstime":null,"volumeCalcule":null,"etage":null,"ascenseur":null,"dateSouhaitee":null,"formule":null,"prenom":null,"nom":null,"telephone":null,"email":null,"creneauRappel":null,"satisfaction":null,"objetSpeciaux":[],"monteMeuble":false,"monteMeubleDepart":false,"monteMeubleArrivee":false,"autorisationStationnement":false,"autorisationStationnementDepart":false,"autorisationStationnementArrivee":false,"caveOuStockage":false,"international":false,"contraintes":null,"typeEscalierDepart":null,"typeEscalierArrivee":null,"gabaritAscenseurDepart":null,"gabaritAscenseurArrivee":null,"accesDifficileDepart":false,"accesDifficileArrivee":false,"rdvConseiller":false,"creneauVisite":null}-->`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION DYNAMIQUE — recalculée à chaque tour
// ─────────────────────────────────────────────────────────────────────────────

function buildDynamicSection(
    leadData: LeadData,
    estimation: Estimation | null,
    distanceKm: number | null,
): string {
    const parts: string[] = [];

    // 1. Estimation calculée côté serveur
    if (estimation) {
        parts.push(
            `# ESTIMATION CALCULÉE (UTILISER OBLIGATOIREMENT)\n` +
            `Fourchette : ${estimation.min} à ${estimation.max} € (formule ${estimation.formule}, distance incluse).\n` +
            `NE PAS modifier ni inventer une autre valeur. Intégrer telle quelle dans le récapitulatif.`,
        );
    }

    // 2. Distance calculée côté serveur
    if (distanceKm !== null && distanceKm > 0) {
        parts.push(
            `# DISTANCE CALCULÉE\n` +
            `Valeur à utiliser dans le récapitulatif : ~${distanceKm} km.\n` +
            `Format attendu : "📍 Trajet : [Départ] ➡️ [Arrivée] (~${distanceKm} km)".`,
        );
    }

    // 3. État du parcours (contexte conversationnel)
    parts.push(buildParcoursState(leadData));

    // 4. Checklist de progression
    parts.push(buildProgressChecklist(leadData));

    // 5. Données collectées (JSON compact — uniquement champs renseignés)
    parts.push(buildCollectedData(leadData));

    return parts.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS INTERNES
// ─────────────────────────────────────────────────────────────────────────────

function formatContact(entreprise: EntrepriseConfig): string {
    const parts: string[] = [];
    if (entreprise.telephone) parts.push(`au ${entreprise.telephone}`);
    if (entreprise.email) parts.push(`par mail à ${entreprise.email}`);
    return parts.length > 0 ? parts.join(' ou ') : 'directement (coordonnées sur notre site)';
}

function buildParcoursState(leadData: LeadData): string {
    const p = leadData.projetData ?? {};
    const contactOk = hasContactInfo(leadData);
    const rdvOk = hasRdvVisite(leadData);
    const noPhone = !leadData.telephone && !!leadData.email;

    const lines: string[] = ['# ÉTAT DU PARCOURS'];

    lines.push(
        contactOk
            ? `- Coordonnées : OUI — NE PAS redemander. Afficher : 📞 ${leadData.telephone} — 📧 ${leadData.email}`
            : `- Coordonnées : NON — à collecter (A3 si visite, B5-B6 sinon)`,
    );

    lines.push(`- RDV visite : ${rdvOk ? `OUI (${p.creneauVisite}) — inclure dans le récap` : 'NON'}`);

    if (p.stationnementDepart) lines.push(`- Stationnement départ : COLLECTÉ (${p.stationnementDepart}) → NE PAS redemander`);
    if (p.stationnementArrivee) lines.push(`- Stationnement arrivée : COLLECTÉ (${p.stationnementArrivee}) → NE PAS redemander`);
    if (noPhone) lines.push(`- Pas de téléphone → NE PAS demander le créneau de recontact`);
    if (leadData.creneauRappel) lines.push(`- Créneau rappel : COLLECTÉ (${leadData.creneauRappel}) → passer au message de clôture`);
    if (p.creneauVisite) lines.push(`- Créneau visite : COLLECTÉ (${p.creneauVisite}) → NE PAS redemander`);
    if (leadData.satisfaction) lines.push(`- Satisfaction : COLLECTÉE → message de clôture UNIQUEMENT`);

    return lines.join('\n');
}

function buildProgressChecklist(leadData: LeadData): string {
    const p = leadData.projetData ?? {};
    const rdvRefused = p.rdvConseiller === false;

    const steps: Array<{ label: string; done: boolean; skip?: boolean }> = [
        { label: '1. Trajet (départ + arrivée)', done: !!(p.villeDepart && p.villeArrivee) },
        { label: '2. Type logement + surface/pièces', done: !!(p.typeHabitationDepart && (p.surface || p.nbPieces)) },
        { label: '3. Configuration + accès départ', done: !!(p.stationnementDepart) },
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

    const lines = ['# PROGRESSION'];
    for (const step of steps) {
        if (step.skip) continue;
        lines.push(`${step.done ? '✅' : '⏳'} ${step.label}`);
    }
    return lines.join('\n');
}

function buildCollectedData(leadData: LeadData): string {
    const p = leadData.projetData ?? {};

    const isPopulated = (v: unknown): boolean =>
        v !== null && v !== undefined && v !== false && v !== '' && !(Array.isArray(v) && v.length === 0);

    const projetFiltered = Object.fromEntries(Object.entries(p).filter(([, v]) => isPopulated(v)));

    const personnelFiltered = Object.fromEntries(
        Object.entries({
            prenom: leadData.prenom,
            nom: leadData.nom,
            email: leadData.email,
            telephone: leadData.telephone,
            creneauRappel: leadData.creneauRappel,
            satisfaction: leadData.satisfaction,
        }).filter(([, v]) => isPopulated(v)),
    );

    const hasData = Object.keys(personnelFiltered).length > 0 || Object.keys(projetFiltered).length > 0;
    if (!hasData) return '# DONNÉES COLLECTÉES\nAucune donnée collectée.';

    return `# DONNÉES COLLECTÉES\n${JSON.stringify({ personnel: personnelFiltered, projet: projetFiltered }, null, 2)}`;
}
