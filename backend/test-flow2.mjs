import fs from 'fs';

const API_URL = 'http://localhost:3000';
const API_KEY = '2b76dd8a-8206-4354-9ea6-cf4a8916c11e';
const headers = { 'Content-Type': 'application/json', 'x-api-key': API_KEY };

const userMessages = [
    'Bonjour, je souhaite déménager',
    'De Paris vers Versailles',
    'Un appartement F3 de 70m²',
    'Au 3ème étage sans ascenseur',
    'Je pensais à la formule Standard',
    'Oui bien sûr, je suis Sophie Martin, mon numéro est le 06 12 34 56 78',
];

async function run() {
    const lines = [];
    const log = (s) => { lines.push(s); };

    log('=== CHAT4LEAD - TEST FLOW COMPLET ===\n');

    const health = await fetch(`${API_URL}/health`).then(r => r.json());
    log(`Health: ${health.status} | DB: ${health.database} | Redis: ${health.redis}\n`);

    const init = await fetch(`${API_URL}/api/conversation/init`, {
        method: 'POST', headers, body: JSON.stringify({})
    }).then(r => r.json());
    log(`Conversation ID: ${init.conversationId}\n`);

    for (let i = 0; i < userMessages.length; i++) {
        log(`\n--- Message ${i + 1} ---`);
        log(`>>> USER: ${userMessages[i]}`);
        const t = Date.now();
        const res = await fetch(`${API_URL}/api/conversation/${init.conversationId}/message`, {
            method: 'POST', headers, body: JSON.stringify({ message: userMessages[i] })
        }).then(r => r.json());
        log(`<<< TOM (${Date.now() - t}ms):\n${res.message}`);
    }

    log('\n\n=== TEST TERMINE ===');
    fs.writeFileSync('test-output.txt', lines.join('\n'), 'utf8');
    console.log('Done! Results in test-output.txt');
}

run().catch(e => { console.error(e); process.exit(1); });
