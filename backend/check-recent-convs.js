const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const convs = await prisma.conversation.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { messages: { take: 5, orderBy: { createdAt: 'desc' } } }
    });
    console.log(JSON.stringify(convs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
