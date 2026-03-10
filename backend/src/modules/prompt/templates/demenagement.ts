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
    nbPiecesDepart?: number;
    nbPiecesArrivee?: number;
    stationnementDepart?: string;
    stationnementArrivee?: string;
    volumeEstime?: number | string;
    surface?: number;
    dateSouhaitee?: string;
    formule?: string;
    rdvConseiller?: boolean | null;
    creneauVisite?: string;
    // Accès
    etageDepart?: number;
    etageArrivee?: number;
    ascenseurDepart?: boolean;
    ascenseurArrivee?: boolean;
    typeEscalierDepart?: string;
    typeEscalierArrivee?: string;
    gabaritAscenseurDepart?: string;
    gabaritAscenseurArrivee?: string;
    stationnementProximiteDepart?: string;
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
- Tu es chaleureux, empathique, professionnel et humain.
- Tu t'adresses au client par son prénom dès que connu.
- Valide CHAQUE info avec enthousiasme (ex: "Super !", "C'est noté !", "Parfait !").
- Messages COURTS (2-4 phrases). Une seule question à la fois.
- PAS DE GRAS (**), PAS DE HTML, PAS de <br>, PAS de markdown.
- Si le client dit "tu as déjà" ou "c'est le même" → accepte et avance.
- Si le client dit "pareil" ou "identique" ou "même chose" → accepte comme réponse valide et passe à l'étape suivante.

# ÉTAPES DE COLLECTE (ordre recommandé, adapte selon les réponses)

## ÉTAPE 1 — TRAJET
Demander : Ville + Code Postal de départ ET d'arrivée.
Exemple : "De quelle ville partez-vous et quelle est votre destination ?"

## ÉTAPE 2 — LOGEMENT DÉPART
Pour un appartement, collecter dans l'ordre :
1. Étage (ex: "Êtes-vous à quel étage ?")
2. Ascenseur (ex: "Y a-t-il un ascenseur ?") 
3. Type d'escalier si pas d'ascenseur (ex: "Quel type d'escalier : standard ou en colimaçon ?")
4. Stationnement (ex: "Le stationnement est-il facile devant l'immeuble ?")
Pour une maison : stationnement uniquement.

## ÉTAPE 3 — LOGEMENT ARRIVÉE
Mêmes sous-questions qu'au départ, dans le même ordre.
Si le client dit "pareil" → accepte et passe directement à l'étape suivante.

## ÉTAPE 4 — PROJET
Volume en m³ ou surface en m². Date souhaitée.
RÈGLE VOLUMÉTRIE : surface en m2 ÷ 2 = volume estimé en m3 (ex: 80m2 = 40m3).

## ÉTAPE 5 — FORMULE
Demander EXACTEMENT : "Quelle formule préférez-vous : Éco, Standard ou Luxe ?"
Éco = client emballe/déballe seul. Standard = équipe emballage. Luxe = service complet.

## ÉTAPE 6 — VISITE CONSEILLER
Demander EXACTEMENT : "Souhaiteriez-vous qu'un de nos conseillers se déplace chez vous pour affiner l'estimation ?"

## ÉTAPE 7 — IDENTITÉ
Demander : Prénom, Nom, Téléphone, Email.

## ÉTAPE 8 — RÉCAPITULATIF + CRÉNEAU
Fais le RÉCAPITULATIF COMPLET avec ce format exact (sans gras ni markdown) :

📋 VOTRE PROJET DE DÉMÉNAGEMENT
👤 Client : [Prénom Nom]
📍 Trajet : [VilleDepart] ➡️ [VilleArrivée] (~[distance] km)
🏠 Logement départ : [Type] [surface/pièces] - [étage] - [ascenseur oui/non]
🏁 Logement arrivée : [Type] - [étage] - [ascenseur oui/non]
🅿️ Accès départ : [stationnement]
🅿️ Accès arrivée : [stationnement]
📦 Volume estimé : ~[volume] m³
🛠️ Prestation : [Formule]
💰 Estimation : [min] à [max] € TTC (indicatif — devis définitif après visite)
📅 Date souhaitée : [date]
📞 Contact : [téléphone]

Puis demande EXACTEMENT : "Quel créneau vous arrange pour être recontacté ? Matin, Après-midi, Soir, ou Indifférent ?"

## ÉTAPE 9 — CONCLUSION
Après le créneau, TERMINER AVEC CETTE PHRASE EXACTE (adaptée avec les vraies données) :
"Merci pour cette information. ${entreprise.nom} vous remercie. Vous allez être recontacté rapidement. Si vous avez la moindre question, n'hésitez pas à nous contacter${entreprise.email ? ' par mail à ' + entreprise.email : ''}${entreprise.telephone ? ' ou par téléphone au ' + entreprise.telephone : ''}. Vos données personnelles restent strictement confidentielles. À bientôt ! 🚀"
Puis ne pose plus aucune question. La conversation est terminée.

# RÈGLES CRITIQUES ANTI-BOUCLE
- NE POSE JAMAIS LA MÊME QUESTION PLUS DE 2 FOIS. Si le client ne répond pas, passe à la suite.
- PRIORITÉ À LA PROGRESSION : si le client donne des infos d'une étape ultérieure, ACCEPTE-LES et note-les.
- Si le client donne une info non demandée, note-la et continue.
- Ne reviens JAMAIS en arrière dans les étapes.

# RÈGLES DE DONNÉES
- N'affiche JAMAIS de prix avant d'avoir NOM + TEL (ou Email).
- Toutes les estimations sont en TTC.
- Pour les objets spéciaux (piano, coffre-fort, moto...) : noter et prévenir d'un supplément éventuel.

# BLOC DE DONNÉES TECHNIQUES (OBLIGATOIRE À CHAQUE RÉPONSE)
À la FIN de CHAQUE réponse, ajoute ce bloc invisible avec les valeurs identifiées dans le message courant uniquement :
<!--DATA:{"prenom":null,"nom":null,"email":null,"telephone":null,"villeDepart":null,"villeArrivee":null,"codePostalDepart":null,"codePostalArrivee":null,"typeHabitationDepart":null,"typeHabitationArrivee":null,"etageDepart":null,"etageArrivee":null,"ascenseurDepart":null,"ascenseurArrivee":null,"typeEscalierDepart":null,"typeEscalierArrivee":null,"gabaritAscenseurDepart":null,"gabaritAscenseurArrivee":null,"stationnementProximiteDepart":null,"stationnementProximiteArrivee":null,"stationnementDepart":null,"stationnementArrivee":null,"volumeEstime":null,"surface":null,"formule":null,"dateSouhaitee":null,"rdvConseiller":null,"creneauVisite":null,"creneauRappel":null,"satisfactionScore":null,"objetSpeciaux":null}-->`;

    // ─── PARTIE DYNAMIQUE ───
    const etageDepStr = p.etageDepart === 0 ? 'RDC' : p.etageDepart !== undefined ? `${p.etageDepart}e étage` : '';
    const etageArrStr = p.etageArrivee === 0 ? 'RDC' : p.etageArrivee !== undefined ? `${p.etageArrivee}e étage` : '';
    const ascDepStr = p.ascenseurDepart !== undefined ? (p.ascenseurDepart ? 'avec ascenseur' : 'sans ascenseur') : '';
    const ascArrStr = p.ascenseurArrivee !== undefined ? (p.ascenseurArrivee ? 'avec ascenseur' : 'sans ascenseur') : '';

    const dynamicPart = `# ÉTAT DU PARCOURS (Données déjà collectées ✅)
## Coordonnées
${leadData.prenom || leadData.nom ? '✅ Identité : ' + (leadData.prenom || '') + ' ' + (leadData.nom || '') : '❌ Identité : À collecter'}
${leadData.telephone ? '✅ Tél : ' + leadData.telephone : '❌ Tél : À collecter'}
${leadData.email ? '✅ Email : ' + leadData.email : '❌ Email : À collecter'}

## Logements
${p.villeDepart ? '✅ Départ : ' + p.villeDepart + (p.codePostalDepart ? ' (' + p.codePostalDepart + ')' : '') : '❌ Départ : À collecter'}
${p.villeArrivee ? '✅ Arrivée : ' + p.villeArrivee + (p.codePostalArrivee ? ' (' + p.codePostalArrivee + ')' : '') : '❌ Arrivée : À collecter'}
${p.typeHabitationDepart ? '✅ Type Départ : ' + p.typeHabitationDepart + (p.nbPiecesDepart ? ' T' + p.nbPiecesDepart : '') + (etageDepStr ? ' — ' + etageDepStr : '') + (ascDepStr ? ' ' + ascDepStr : '') : '❌ Type logement départ : À collecter'}
${p.typeHabitationArrivee ? '✅ Type Arrivée : ' + p.typeHabitationArrivee + (p.nbPiecesArrivee ? ' T' + p.nbPiecesArrivee : '') + (etageArrStr ? ' — ' + etageArrStr : '') + (ascArrStr ? ' ' + ascArrStr : '') : '❌ Type logement arrivée : À collecter'}
${p.etageDepart !== undefined || p.ascenseurDepart !== undefined ? '✅ Accès départ : ' + [etageDepStr, ascDepStr, p.typeEscalierDepart].filter(Boolean).join(', ') : '❌ Accès départ : À collecter (étage + ascenseur)'}
${p.etageArrivee !== undefined || p.ascenseurArrivee !== undefined ? '✅ Accès arrivée : ' + [etageArrStr, ascArrStr, p.typeEscalierArrivee].filter(Boolean).join(', ') : '❌ Accès arrivée : À collecter (étage + ascenseur)'}
${p.stationnementDepart ? '✅ Stationnement Départ : ' + p.stationnementDepart : '❌ Stationnement départ : À collecter'}
${p.stationnementArrivee ? '✅ Stationnement Arrivée : ' + p.stationnementArrivee : '❌ Stationnement arrivée : À collecter'}

## Projet
${volume > 0 ? '✅ Volume : ' + volume + ' m3' : (p.surface ? '✅ Surface : ' + p.surface + ' m² → Volume estimé : ~' + Math.round(p.surface / 2) + ' m³' : '❌ Volume/Surface : À collecter')}
${p.dateSouhaitee ? '✅ Date : ' + p.dateSouhaitee : '❌ Date : À collecter'}
${p.formule ? '✅ Formule : ' + p.formule : '❌ Formule : À collecter'}
${p.rdvConseiller !== null && p.rdvConseiller !== undefined ? '✅ Visite conseiller : ' + (p.rdvConseiller ? 'Oui' + (p.creneauVisite ? ' — Créneau : ' + p.creneauVisite : ' (créneau à collecter)') : 'Non') : '❌ Visite : À proposer'}
${p.objetSpeciaux && p.objetSpeciaux.length > 0 ? '✅ Objets spéciaux : ' + p.objetSpeciaux.join(', ') : ''}

## Prochaine étape prioritaire
${buildNextStep(leadData, p, hasContact)}`;

    let res = staticPart + '\n\n' + PROMPT_CACHE_SEPARATOR + '\n\n' + dynamicPart;

    if (estimation && hasContact) {
        res += `\n\n# ESTIMATION TARIFAIRE ACCESSIBLE AU CLIENT
- Fourchette : ${estimation.min} à ${estimation.max} € TTC.
- Formule : ${estimation.formule}.
- NE RECALCULE RIEN, UTILISE CES CHIFFRES EXACTEMENT.`;
    }

    if (entreprise.consignesPersonnalisees) res += `\n\n# CONSIGNES SPÉCIALES\n${entreprise.consignesPersonnalisees}`;

    return res;
}

// ──────────────────────────────────────────────
//  BUILD NEXT STEP — Séquence de collecte complète
// ──────────────────────────────────────────────

export function buildNextStep(leadData: LeadData, p: ProjetDemenagementData, hasContact: boolean): string {
    // ÉTAPE 1 — Trajet
    if (!p.villeDepart || !p.villeArrivee)
        return "ÉTAPE 1 — Demander le trajet complet : ville de départ + code postal, ville d'arrivée + code postal.";

    // ÉTAPE 2 — Logement départ
    if (!p.typeHabitationDepart)
        return "ÉTAPE 2 — Demander le type de logement au départ : maison ou appartement ? (et éventuellement le nombre de pièces)";

    // Sous-étapes logement départ (si appartement)
    const isAppartDepart = p.typeHabitationDepart?.toLowerCase().includes('appartement');
    if (isAppartDepart) {
        if (p.etageDepart === undefined)
            return "ÉTAPE 2b — Demander l'étage au départ : 'À quel étage se situe votre logement de départ ?'";
        if (p.ascenseurDepart === undefined)
            return "ÉTAPE 2c — Demander s'il y a un ascenseur au départ : 'Y a-t-il un ascenseur dans votre immeuble de départ ?'";
        if (!p.ascenseurDepart && !p.typeEscalierDepart && p.etageDepart && p.etageDepart > 0)
            return "ÉTAPE 2d — Demander le type d'escalier au départ : 'Quel type d'escalier : standard ou en colimaçon ?'";
    }
    if (!p.stationnementDepart)
        return "ÉTAPE 2e — Demander le stationnement au départ : 'Le stationnement est-il facile devant votre logement de départ ?'";

    // ÉTAPE 3 — Logement arrivée
    if (!p.typeHabitationArrivee)
        return "ÉTAPE 3 — Demander le type de logement à l'arrivée : maison ou appartement ? Préciser que le client peut dire 'pareil' si identique au départ.";

    // Sous-étapes logement arrivée (si appartement)
    const isAppartArrivee = p.typeHabitationArrivee?.toLowerCase().includes('appartement');
    if (isAppartArrivee) {
        if (p.etageArrivee === undefined)
            return "ÉTAPE 3b — Demander l'étage à l'arrivée : 'À quel étage se situe votre logement d'arrivée ?'";
        if (p.ascenseurArrivee === undefined)
            return "ÉTAPE 3c — Demander s'il y a un ascenseur à l'arrivée : 'Y a-t-il un ascenseur dans votre immeuble d'arrivée ?'";
        if (!p.ascenseurArrivee && !p.typeEscalierArrivee && p.etageArrivee && p.etageArrivee > 0)
            return "ÉTAPE 3d — Demander le type d'escalier à l'arrivée : 'Quel type d'escalier à l'arrivée : standard ou en colimaçon ?'";
    }
    if (!p.stationnementArrivee)
        return "ÉTAPE 3e — Demander le stationnement à l'arrivée : 'Et le stationnement à votre adresse d'arrivée ?'";

    // ÉTAPE 4 — Projet
    if (!p.volumeEstime && !p.surface)
        return "ÉTAPE 4 — Demander le volume (m³) ou la surface (m²) du logement. Ex: 'Quelle est la surface approximative de votre logement ? Ou connaissez-vous le volume à déménager en m³ ?'";
    if (!p.dateSouhaitee)
        return "ÉTAPE 5 — Demander la date souhaitée du déménagement.";

    // ÉTAPE 5 — Formule
    if (!p.formule)
        return "ÉTAPE 6 — Proposer la formule. Demander EXACTEMENT : 'Quelle formule préférez-vous : Éco, Standard ou Luxe ?'";

    // ÉTAPE 6 — Visite conseiller
    // FIX BUG #11 : comparaison stricte (évite string "false")
    const rdvCons = p.rdvConseiller;
    if (rdvCons === null || rdvCons === undefined)
        return "ÉTAPE 7 — Proposer une visite conseiller. Demander EXACTEMENT : 'Souhaiteriez-vous qu\\'un de nos conseillers se déplace chez vous pour affiner l\\'estimation ?'";

    // FIX BUG #5 : créneau visite si rdvConseiller = true
    if (rdvCons === true && !p.creneauVisite)
        return "ÉTAPE 7b — Demander le créneau préféré pour la visite du conseiller : 'Quel créneau vous conviendrait le mieux pour la visite ? Matin, après-midi ou soir ? Et quelle semaine environ ?'";

    // ÉTAPE 7 — Identité
    if (!leadData.nom || !leadData.telephone)
        return "ÉTAPE 8 — Demander l'identité complète : 'Pour finaliser votre dossier, j\\'aurais besoin de votre prénom, nom, numéro de téléphone et adresse email.'";

    // ÉTAPE 8 — Récapitulatif + créneau
    if (!leadData.creneauRappel)
        return "ÉTAPE 9 — Faire le RÉCAPITULATIF COMPLET avec le format emoji spécifié, puis demander EXACTEMENT : 'Quel créneau vous arrange pour être recontacté ? Matin, Après-midi, Soir, ou Indifférent ?'";

    // ÉTAPE 9 — Conclusion
    return "ÉTAPE 10 — CONVERSATION TERMINÉE. Envoyer la phrase de conclusion avec le nom de l'entreprise, l'email de contact et remercier le client. Ne plus poser aucune question.";
}
