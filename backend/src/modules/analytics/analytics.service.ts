import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

export class AnalyticsService {

    /**
     * Calculer le taux de satisfaction basé sur les réponses des leads
     */
    async getSatisfactionRate() {
        try {
            const leads = await prisma.lead.findMany({
                where: {
                    satisfaction: { not: null }
                },
                select: {
                    satisfaction: true,
                    satisfactionScore: true
                }
            });

            if (leads.length === 0) {
                return { score1: 0, score2: 0, score3: 0, total: 0 };
            }

            const score1 = leads.filter(l =>
                l.satisfactionScore === 1 ||
                l.satisfaction?.toLowerCase().includes('utile') ||
                l.satisfaction?.toLowerCase().includes('fluide')
            ).length;

            const score2 = leads.filter(l =>
                l.satisfactionScore === 2 ||
                l.satisfaction?.toLowerCase().includes('correct')
            ).length;

            const score3 = leads.filter(l =>
                l.satisfactionScore === 3 ||
                l.satisfaction?.toLowerCase().includes('pas clair') ||
                l.satisfaction?.toLowerCase().includes('questions')
            ).length;

            const total = leads.length;

            return {
                score1: (score1 / total) * 100,
                score2: (score2 / total) * 100,
                score3: (score3 / total) * 100,
                total
            };
        } catch (error) {
            logger.error('Error in getSatisfactionRate:', error);
            throw error;
        }
    }

    /**
     * Extraire les commentaires négatifs pour analyse
     */
    async getNegativeComments() {
        try {
            const negativeLeads = await prisma.lead.findMany({
                where: {
                    OR: [
                        { satisfactionScore: 3 },
                        {
                            satisfaction: {
                                contains: 'pas clair',
                                mode: 'insensitive'
                            }
                        },
                        {
                            satisfaction: {
                                contains: 'trop de questions',
                                mode: 'insensitive'
                            }
                        }
                    ]
                },
                select: {
                    id: true,
                    satisfaction: true,
                    createdAt: true
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            return negativeLeads.map(l => ({
                leadId: l.id,
                comment: l.satisfaction || '',
                date: l.createdAt
            }));
        } catch (error) {
            logger.error('Error in getNegativeComments:', error);
            throw error;
        }
    }
}

export const analyticsService = new AnalyticsService();
