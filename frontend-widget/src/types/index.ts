// ──────────────────────────────────────────────
//  TYPES — Chat4Lead Widget
// ──────────────────────────────────────────────

/**
 * Message dans la conversation.
 * Chaque message a un rôle (user, assistant, system),
 * un contenu textuel et un timestamp.
 */
export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}

/**
 * Données du lead collectées au fil de la conversation.
 * Les champs sont optionnels car ils sont remplis progressivement.
 */
export interface LeadData {
    prenom?: string;
    nom?: string;
    email?: string;
    telephone?: string;
    creneauRappel?: string;
    satisfaction?: string;
    satisfactionScore?: number | null;
    score?: number;
    projetData?: {
        villeDepart?: string;
        villeArrivee?: string;
        codePostalDepart?: string;
        codePostalArrivee?: string;
        typeHabitationDepart?: string;
        typeHabitationArrivee?: string;
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
        volumeEstime?: number;
        formule?: string;
        creneauVisite?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
    };
}

/**
 * Configuration du widget injectée lors de l'initialisation.
 * - apiKey : clé API de l'entreprise (obligatoire)
 * - apiUrl : URL du backend (défaut : localhost en dev)
 * - botName : nom du bot affiché dans le widget
 * - primaryColor : couleur principale du widget
 * - position : position du widget sur la page
 * - welcomeMessage : message d'accueil affiché à l'ouverture
 */
export interface WidgetConfig {
    apiKey: string;
    apiUrl?: string;
    botName?: string;
    primaryColor?: string;
    position?: 'bottom-right' | 'bottom-left';
    welcomeMessage?: string;
    autoOpen?: boolean;
    logoUrl?: string;
}

/**
 * État de la connexion WebSocket.
 */
export interface ConnectionStatus {
    isConnected: boolean;
    isConnecting: boolean;
    error?: string;
}
