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
    score?: number;
    projetData?: {
        adresseDepart?: string;
        adresseArrivee?: string;
        surface?: number;
        volumeEstime?: number;
        dateSouhaitee?: string;
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
}

/**
 * État de la connexion WebSocket.
 */
export interface ConnectionStatus {
    isConnected: boolean;
    isConnecting: boolean;
    error?: string;
}
