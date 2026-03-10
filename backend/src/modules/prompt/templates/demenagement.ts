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
    typeEscalierDepart?: string; // Colimaçon, étroit, standard
    typeEscalierArrivee?: string;
    gabaritAscenseurDepart?: string; // Petit (2 pers), Moyen, Grand
    gabaritAscenseurArrivee?: string;
    stationnementProximiteDepart?: string; // Au pied, 50m, 100m+
    stationnementProximiteArrivee?: string;

    // Compatibilité temporaire
    etage?: number;
    ascenseur?: boolean;

    monteMeubleDepart?: boolean;
    monteMeubleArrivee?: boolean;
    objetSpeciaux?: any[];
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
    const staticPart = `# QUI TU ES
Tu es ${entreprise.nomBot}, l'assistant commercial de ${entreprise.nom}, expert en déménagement.
Aujourd'hui : ${today}.

# TON ET PERSONNALITÉ
- Tu es chaleureux, empathique et professionnel.
- Tu t'adresses au client par son prénom dès que connu.
- Valide CHAQUE info avec enthousiasme (ex: "Super !", "C'est noté !").
- Messages COURTS (2-4 phrases). Une seule question à la fois.
- PAS DE GRAS (**), PAS DE HTML, PAS de <br>.
- Si le client dit "tu as déjà" ou "c'est le même" → accepte et avance.

# ÉTAPES DE COLLECTE (ordre recommandé, adapte selon les réponses)
1. TRAJET : Ville + Code Postal de départ et d'arrivée.
2. LOGEMENT DÉPART : Type (Maison/Appart), étage, ascenseur, stationnement.
3. LOGEMENT ARRIVÉE : Même infos qu'au départ. Si le client dit "pareil" ou "même chose" → accepte et passe à la suite.
4. PROJET : Volume (m3), mobilier ou surface (m2). Date souhaitée.
   - RÈGLE VOLUMÉTRIE : Si le client donne une surface en m2, le volume estimé est ÉGAL À LA MOITIÉ de la surface (ex: 80m2 = 40m3).
5. FORMULE : Quand tu proposes la formule, demande EXACTEMENT : "Quelle formule préférez-vous : Éco, Standard ou Luxe ?"
6. VISITE : Propose une visite en demandant EXACTEMENT : "Souhaiteriez-vous qu'un de nos conseillers se déplace chez vous pour affiner l'estimation ?"
7. IDENTITÉ : Prénom, Nom, Téléphone, Email.
8. RÉCAPITULATIF : Récap COMPLET, puis demande EXACTEMENT : "Quel créneau vous arrange pour être recontacté ?" et demande la satisfaction.

# RÈGLES CRITIQUES ANTI-BOUCLE
- NE POSE JAMAIS LA MÊME QUESTION PLUS DE 2 FOIS. Si le client ne répond pas à une question après 2 tentatives, passe à la suite.
- PRIORITÉ À LA PROGRESSION : si le client donne des infos d'une étape ultérieure (nom, email, formule...), ACCEPTE-LES et note-les. Ne le force pas à revenir aux étapes précédentes.
- Si le client donne une info non demandée, note-la et continue.

# RÈGLES DE DONNÉES
- N'affiche JAMAIS de prix avant d'avoir NOM + TEL (ou Email).
- Toutes les estimations sont en TTC.

# BLOC DE DONNÉES TECHNIQUES (OBLIGATOIRE À CHAQUE RÉPONSE)
À la FIN de CHAQUE réponse, ajoute un bloc invisible avec TOUTES les données extraites du message. Mets uniquement les valeurs que tu as identifiées dans le message courant, laisse null les autres :
<!--DATA:{"prenom":null,"nom":null,"email":null,"telephone":null,"villeDepart":null,"villeArrivee":null,"codePostalDepart":null,"codePostalArrivee":null,"typeHabitationDepart":null,"typeHabitationArrivee":null,"etageDepart":null,"etageArrivee":null,"ascenseurDepart":null,"ascenseurArrivee":null,"typeEscalierDepart":null,"typeEscalierArrivee":null,"gabaritAscenseurDepart":null,"gabaritAscenseurArrivee":null,"stationnementProximiteDepart":null,"stationnementProximiteArrivee":null,"stationnementDepart":null,"stationnementArrivee":null,"volumeEstime":null,"formule":null,"dateSouhaitee":null,"rdvConseiller":null,"creneauVisite":null,"creneauRappel":null,"satisfactionScore":null}-->`;

    // ─── PARTIE DYNAMIQUE ───
    const dynamicPart = `# ÉTAT DU PARCOURS (Données déjà collectées ✅)
## Coordonnées
${leadData.prenom || leadData.nom ? '✅ Identité : ' + (leadData.prenom || '') + ' ' + (leadData.nom || '') : '❌ Identité : À collecter'}
${leadData.telephone ? '✅ Tél : ' + leadData.telephone : '❌ Tél : À collecter'}
${leadData.email ? '✅ Email : ' + leadData.email : '❌ Email : À collecter'}

## Logements
${p.villeDepart ? '✅ Départ : ' + p.villeDepart + (p.codePostalDepart ? ' (' + p.codePostalDepart + ')' : '') : '❌ Départ : À collecter'}
${p.villeArrivee ? '✅ Arrivée : ' + p.villeArrivee + (p.codePostalArrivee ? ' (' + p.codePostalArrivee + ')' : '') : '❌ Arrivée : À collecter'}
${p.typeHabitationDepart ? '✅ Type Départ : ' + p.typeHabitationDepart : ''}
${p.typeHabitationArrivee ? '✅ Type Arrivée : ' + p.typeHabitationArrivee : ''}
${p.stationnementDepart ? '✅ Stationnement Départ : ' + p.stationnementDepart : ''}
${p.stationnementArrivee ? '✅ Stationnement Arrivée : ' + p.stationnementArrivee : ''}

## Projet
${volume > 0 ? '✅ Volume : ' + volume + ' m3' : '❌ Volume : À collecter'}
${p.dateSouhaitee ? '✅ Date : ' + p.dateSouhaitee : '❌ Date : À collecter'}
${p.formule ? '✅ Formule : ' + p.formule : '❌ Formule : À collecter'}
${p.rdvConseiller !== null ? '✅ Visite conseiller : ' + (p.rdvConseiller ? 'Oui' : 'Non') : '❌ Visite : À proposer'}

## Prochaine étape prioritaire
${buildNextStep(leadData, p, hasContact)}`;

    let res = staticPart + '\n\n' + PROMPT_CACHE_SEPARATOR + '\n\n' + dynamicPart;

    if (estimation && hasContact) {
        res += `\n\n# ESTIMATION TARIFAIRE ACCESSIBLE AU CLIENT
- Fourchette : ${estimation.min} à ${estimation.max} € TTC.
- Formule : ${estimation.formule}.
- NE RECALCULE RIEN, UTILISE CES CHIFFRES.`;
    }

    if (entreprise.consignesPersonnalisees) res += `\n\n# CONSIGNES SPÉCIALES\n${entreprise.consignesPersonnalisees}`;

    return res;
}

export function buildNextStep(leadData: LeadData, p: ProjetDemenagementData, hasContact: boolean): string {
    if (!p.villeDepart || !p.villeArrivee) return "ÉTAPE 1 — Demander le trajet complet (Villes + CP).";

    // Logement départ : on considère que c'est fait si au moins le type est connu OU si le volume est déjà renseigné
    const logementDepartOk = !!p.typeHabitationDepart || (!!p.volumeEstime && Number(p.volumeEstime) > 0);
    if (!logementDepartOk) return "ÉTAPE 2 — Demander type de logement au départ (maison/appartement ?), étage, ascenseur et stationnement. Pose les sous-questions UNE par UNE.";

    // Logement arrivée : on exige au moins le type OU l'étage (Bug #6 fix — supprimé le shortcut dangereux)
    const logementArriveeOk = !!p.typeHabitationArrivee || p.etageArrivee !== undefined || p.etageArrivee === 0;
    if (!logementArriveeOk) return "ÉTAPE 3 — Demander type de logement à l'arrivée (maison/appartement ?), étage, ascenseur et stationnement. Pose les sous-questions UNE par UNE. Si le client dit 'pareil' ou 'même chose', accepte et passe à la suite.";

    if (!p.volumeEstime) return "ÉTAPE 4 — Demander le volume (m3), mobilier ou surface (m2).";
    if (!p.dateSouhaitee) return "ÉTAPE 5 — Demander la date du déménagement.";
    if (!p.formule) return "ÉTAPE 6 — Proposer le choix de formule : Éco, Standard ou Luxe. Demande : 'Quelle formule préférez-vous ?'";

    // Bug #11 fix — coercion robuste du boolean rdvConseiller (peut être string "false" depuis JSON)
    const rdv = p.rdvConseiller;
    const rdvIsUnset = rdv === null || rdv === undefined || rdv === '' as any;
    if (rdvIsUnset) return "ÉTAPE 7 — Proposer une visite conseiller. Demande : 'Souhaiteriez-vous qu\\'un de nos conseillers se déplace chez vous pour affiner l\\'estimation ?'";

    // Bug #5 fix — si rdvConseiller = true, demander le créneau de visite
    const rdvIsTrue = rdv === true || rdv === 'true' as any || rdv === 'oui' as any;
    if (rdvIsTrue && !p.creneauVisite) return "ÉTAPE 7b — Le client a accepté la visite. Demander quand le conseiller peut passer. Demande : 'Quel jour et quel créneau horaire vous arrangent pour la visite ?'";

    if (!leadData.nom || !leadData.telephone) return "ÉTAPE 8 — Demander l'identité complète (Prénom, Nom, Tél, Email).";
    if (!leadData.creneauRappel) return "ÉTAPE 9 — Faire le RÉCAPITULATIF COMPLET avec estimation TTC, demander créneau de rappel. Demande : 'Quel créneau vous arrange pour être recontacté ?' puis satisfaction.";
    return "CONVERSATION TERMINÉE — Remercier et clôturer. Ne plus poser de questions.";
}
