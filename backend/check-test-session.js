const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const session = await prisma.manualTestSession.findUnique({
        where: { id: '3417cc34-31ad-46c8-898a-d5238fccd327' }
    });
    if (!session) {
        console.log('Session not found');
        return;
    }

    const conv = await prisma.conversation.findUnique({
        where: { id: session.conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' } } }
    });

    console.log(JSON.stringify(conv, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
