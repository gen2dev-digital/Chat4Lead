export interface ManualTestSession {
    id: string;
    phase: string;
    testerProfile?: string | null;
    conversationId: string;
    startTime: Date;
    endTime?: Date | null;
    feedback?: any;
    reportFilename?: string | null;
    createdAt: Date;
    lastScore?: number | null;
    lastPriority?: string | null;
    messageCount?: number;
}
export declare const testSessionService: {
    startSession(data: {
        phase: string;
        testerProfile?: string;
        conversationId: string;
    }): Promise<{
        sessionId: string;
    }>;
    submitFeedback(sessionId: string, feedback: any, conversationData: any): Promise<{
        reportFilename: string | null;
    }>;
    getDashboard(testerProfile?: string): Promise<{
        sessions: {
            sessionId: string;
            createdAt: string;
            startTime: string;
            endTime: string | undefined;
            id: string;
            updatedAt: Date;
            conversationId: string;
            phase: string;
            testerProfile: string | null;
            feedback: import("@prisma/client/runtime/library").JsonValue | null;
            reportFilename: string | null;
            lastScore: number | null;
            lastPriority: string | null;
            messageCount: number;
        }[];
        stats: {
            phase1: {
                total: number;
                withFeedback: number;
                avgNote: string | null;
                successCount: number;
                failCount: number;
            };
            phase2: {
                total: number;
                withFeedback: number;
                avgNaturalite: string | null;
                pctDonneraitNumero: number | null;
            };
            phase3: {
                total: number;
                withFeedback: number;
                pctInfosSuffisantes: number | null;
            };
        };
    }>;
    generateReportHTML(sessionId: string, conversationData: any): Promise<string>;
};
