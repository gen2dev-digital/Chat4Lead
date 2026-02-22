export declare class AnalyticsService {
    /**
     * Calculer le taux de satisfaction basé sur les réponses des leads
     */
    getSatisfactionRate(): Promise<{
        score1: number;
        score2: number;
        score3: number;
        total: number;
    }>;
    /**
     * Extraire les commentaires négatifs pour analyse
     */
    getNegativeComments(): Promise<{
        leadId: string;
        comment: string;
        date: Date;
    }[]>;
}
export declare const analyticsService: AnalyticsService;
