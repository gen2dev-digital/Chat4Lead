import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CONV_ID = '0749b697-e820-4fdd-becb-28a3370fc456';

async function main() {
    const conversation = await prisma.conversation.findUnique({
        where: { id: CONV_ID },
        include: {
            messages: { orderBy: { createdAt: 'asc' } },
            lead: true,
        }
    });

    if (!conversation) { console.log('❌ Conversation introuvable'); return; }

    const lead = conversation.lead;
    console.log('\n══════════════════════════════════════════');
    console.log('📊 LEAD FINAL');
    console.log('══════════════════════════════════════════');
    console.log(`Prénom : ${lead?.prenom ?? '—'}`);
    console.log(`Nom    : ${lead?.nom ?? '—'}`);
    console.log(`Email  : ${lead?.email ?? '—'}`);
    console.log(`Tél    : ${lead?.telephone ?? '—'}`);
    console.log(`Score  : ${lead?.score ?? '—'} / Priorité : ${lead?.priorite ?? '—'}`);
    console.log('\n📁 ProjetData :');
    console.log(JSON.stringify(lead?.projetData ?? {}, null, 2));

    console.log('\n══════════════════════════════════════════');
    console.log(`💬 MESSAGES (${conversation.messages.length})`);
    console.log('══════════════════════════════════════════');

    let botTurn = 0;
    for (const msg of conversation.messages) {
        if (msg.role === 'assistant') botTurn++;
        const role = msg.role === 'user' ? '👤 USER' : `🤖 BOT[${botTurn}]`;

        // Extraire le bloc DATA du message bot
        const dataMatch = msg.content.match(/<!--DATA:([\s\S]*?)-->/);
        const textOnly = msg.content.replace(/<!--DATA:[\s\S]*?-->/g, '').trim();

        // Flags de répétition
        let flags = '';
        if (msg.role === 'assistant') {
            const l = msg.content.toLowerCase();
            if (l.includes('prénom') && l.includes('nom') && lead?.prenom) flags += ' ⚠️[REDEMANDE IDENTITE]';
            if ((l.includes('téléphone') || l.includes('numéro')) && lead?.telephone) flags += ' ⚠️[REDEMANDE TEL]';
            if (l.includes('@') && l.includes('.') && lead?.email) flags += ' ⚠️[REDEMANDE EMAIL]';
        }

        console.log(`\n${role}${flags}`);
        const lines = textOnly.split('\n').slice(0, 5);
        lines.forEach(l => console.log(`   ${l.substring(0, 130)}`));
        if (textOnly.split('\n').length > 5) console.log(`   ...(${textOnly.split('\n').length - 5} lignes de plus)`);

        // Afficher le bloc DATA pour les bots
        if (dataMatch && msg.role === 'assistant') {
            try {
                const data = JSON.parse(dataMatch[1]);
                const important = {
                    prenom: data.prenom,
                    nom: data.nom,
                    email: data.email,
                    telephone: data.telephone,
                    rdvConseiller: data.rdvConseiller,
                    creneauVisite: data.creneauVisite,
                    dateSouhaitee: data.dateSouhaitee,
                    formule: data.formule,
                };
                console.log(`   📦 DATA: ${JSON.stringify(important)}`);
            } catch {
                console.log(`   📦 DATA: [parse error]`);
            }
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
