interface MessageHandlerInput {
    conversationId: string;
    entrepriseId: string;
    message: string;
}
interface MessageHandlerOutput {
    reply: string;
    leadData?: any;
    score?: number;
    actions?: string[];
    metadata?: {
        tokensUsed?: number;
        latencyMs?: number;
        entitiesExtracted?: any;
        error?: boolean;
    };
}
export declare class MessageHandler {
    /**
     * Méthode principale : traite un message utilisateur de bout en bout.
     *
     * Workflow : contexte → prompt → LLM → extraction → scoring → actions → sauvegarde
     */
    handleUserMessage(input: MessageHandlerInput): Promise<MessageHandlerOutput>;
    /**
     * Récupère le contexte complet : conversation, lead, entreprise, config métier.
     */
    private getFullContext;
    /**
     * Extrait les entités structurées depuis le message utilisateur
     * et la réponse du bot (confirmation de données).
     */
    private extractEntities;
    /**
     * Extraction robuste du prénom et du nom avec 7 patterns et stop words.
     */
    private extractName;
    /**
     * Helper pour mettre en majuscule la première lettre.
     */
    private capitalizeFirst;
    /**
     * Met à jour le lead avec les nouvelles entités extraites.
     * Fusionne les données projet existantes avec les nouvelles.
     */
    private updateLead;
    /**
     * Calcule le score du lead sur 100 :
     *   40 pts — complétude des informations
     *   30 pts — urgence (proximité de la date)
     *   20 pts — valeur du projet (volume)
     *   10 pts — engagement (base)
     */
    private calculateScore;
    /**
     * Priorité du lead selon son score
     */
    private getPriorite;
    /**
     * Déclenche des actions selon le lead et son score :
     *   - Notification email si lead chaud
     *   - Push CRM si coordonnées complètes
     *   - Qualification de la conversation
     */
    private triggerActions;
    /**
     * Nettoie la réponse du LLM :
     *  - Supprime toutes les balises HTML (<br>, <br/>, <p>, etc.)
     *  - Supprime les astérisques / markdown bold
     *  - Normalise les sauts de ligne (max 2 consécutifs)
     *  - Trim chaque ligne
     */
    private static readonly TECH_ACTION_CODES;
    private sanitizeReply;
    /**
     * Résout un code postal en ville via l'API Geo Gouv.
     */
    private resolvePostalCode;
}
export declare const messageHandler: MessageHandler;
export {};
