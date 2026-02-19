
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const apiKey = '2b76dd8a-8206-4354-9ea6-cf4a8916c11e';
    const entreprise = await prisma.entreprise.findFirst({
        where: {
            apiKey: apiKey
        }
    });

    if (entreprise) {
        console.log('✅ Entreprise found:', entreprise.nom);
    } else {
        console.log('❌ Entreprise NOT found with API key:', apiKey);
        const all = await prisma.entreprise.findMany();
        console.log('Available entreprises:', all.length);
        if (all.length > 0) {
            console.log('First entreprise API key:', all[0].apiKey);
            console.log('First entreprise name:', all[0].nom);
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
