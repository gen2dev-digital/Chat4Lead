import { Metier, StatusConversation } from '@prisma/client';
export declare class ConversationService {
    /**
     * Crée une nouvelle conversation en base de données
     */
    createConversation(leadId: string, entrepriseId: string, metier: Metier): Promise<{
        status: import(".prisma/client").$Enums.StatusConversation;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        metier: import(".prisma/client").$Enums.Metier;
        leadId: string | null;
        entrepriseId: string;
    }>;
    /**
     * Récupère une conversation avec son lead et les 50 derniers messages
     */
    getConversation(conversationId: string): Promise<{
        lead: {
            id: string;
            nom: string | null;
            email: string | null;
            telephone: string | null;
            createdAt: Date;
            updatedAt: Date;
            entrepriseId: string;
            prenom: string | null;
            projetData: import("@prisma/client/runtime/library").JsonValue;
            score: number;
            priorite: import(".prisma/client").$Enums.PrioriteLead;
            statut: import(".prisma/client").$Enums.StatutLead;
            notificationSent: boolean;
            pushedToCRM: boolean;
            creneauRappel: string | null;
            satisfaction: string | null;
            satisfactionScore: number | null;
        } | null;
        messages: {
            id: string;
            createdAt: Date;
            conversationId: string;
            role: import(".prisma/client").$Enums.RoleMessage;
            content: string;
            tokensUsed: number | null;
            latencyMs: number | null;
        }[];
    } & {
        status: import(".prisma/client").$Enums.StatusConversation;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        metier: import(".prisma/client").$Enums.Metier;
        leadId: string | null;
        entrepriseId: string;
    }>;
    /**
     * Récupère une conversation existante ou en crée une nouvelle si nécessaire
     */
    getOrCreateConversation(entrepriseId: string, sessionId?: string, metier?: Metier): Promise<{
        conversationId: string;
        isNew: boolean;
        reply?: undefined;
        actions?: undefined;
    } | {
        conversationId: string;
        isNew: boolean;
        reply: string;
        actions: string[];
    }>;
    /**
     * Ferme une conversation avec un statut spécifique
     */
    closeConversation(conversationId: string, status: StatusConversation): Promise<{
        status: import(".prisma/client").$Enums.StatusConversation;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        metier: import(".prisma/client").$Enums.Metier;
        leadId: string | null;
        entrepriseId: string;
    }>;
}
export declare const conversationService: ConversationService;
