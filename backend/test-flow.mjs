// Full conversation flow test
const API_URL = 'http://localhost:3000';
const API_KEY = '2b76dd8a-8206-4354-9ea6-cf4a8916c11e';

const headers = {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
};

const messages = [
    'Bonjour, je souhaite déménager',
    'De Paris vers Versailles',
    'Un appartement F3 de 70m²',
    'Au 3ème étage sans ascenseur',
    'Je pensais à la formule Standard',
    'Oui bien sûr, je suis Sophie Martin, mon numéro est le 06 12 34 56 78',
];

async function runTest() {
    console.log('=== CHAT4LEAD - TEST FLOW COMPLET ===\n');

    // 1. Health check
    const health = await fetch(`${API_URL}/health`).then(r => r.json());
    console.log(`✅ Health: ${health.status} | DB: ${health.database} | Redis: ${health.redis}\n`);

    // 2. Init conversation
    const initRes = await fetch(`${API_URL}/api/conversation/init`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
    }).then(r => r.json());

    const convId = initRes.conversationId;
    console.log(`✅ Conversation initialisée: ${convId}\n`);

    // 3. Send messages sequentially
    for (let i = 0; i < messages.length; i++) {
        const userMsg = messages[i];
        console.log(`\n--- Message ${i + 1} ---`);
        console.log(`>>> USER: ${userMsg}`);

        const startTime = Date.now();
        const res = await fetch(`${API_URL}/api/conversation/${convId}/message`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ message: userMsg }),
        }).then(r => r.json());

        const elapsed = Date.now() - startTime;
        console.log(`<<< TOM (${elapsed}ms): ${res.message}`);
    }

    console.log('\n\n=== TEST TERMINÉ ===');
}

runTest().catch(console.error);
