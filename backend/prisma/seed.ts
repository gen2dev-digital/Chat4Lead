import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Purger les données existantes pour repartir à neuf
    await prisma.configMetier.deleteMany();
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.entreprise.deleteMany();

    const entreprise = await prisma.entreprise.create({
        data: {
            nom: "Déménagements Test Paris",
            email: "test@demenagements-test.fr",
            nomBot: "Tom",
            plan: "STARTER",
            status: "ACTIVE",
        },
    });

    await prisma.configMetier.create({
        data: {
            entrepriseId: entreprise.id,
            metier: "DEMENAGEMENT",
            zonesIntervention: ["75", "92", "93", "94"],
            tarifsCustom: {
                base_m3: 35,
                base_km: 2.5,
                formules: {
                    eco: 0.8,
                    standard: 1.0,
                    luxe: 1.4
                }
            },
            specificites: {
                specialite_piano: true,
                monte_meuble: true
            }
        },
    });

    console.log("✅ Seed completed!");
    console.log("📝 API Key:", entreprise.apiKey);
    console.log("🏢 Entreprise ID:", entreprise.id);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
