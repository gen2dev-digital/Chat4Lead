import fs from 'fs';

const API_URL = 'http://localhost:3000';
const API_KEY = '2b76dd8a-8206-4354-9ea6-cf4a8916c11e';
const headers = { 'Content-Type': 'application/json', 'x-api-key': API_KEY };

async function run() {
    const lines = [];
    const log = (s) => lines.push(s);

    log('=== TEST ROUTES API COMPLÈTES ===\n');

    // ── 1. GET /api/conversations (listing) ──
    const list = await fetch(`${API_URL}/api/conversations?limit=3`, { headers }).then(r => r.json());
    log(`1. GET /api/conversations → total: ${list.total}, returned: ${list.conversations.length}, hasMore: ${list.hasMore}`);

    // ── 2. GET /api/conversations?status=ACTIVE ──
    const activeList = await fetch(`${API_URL}/api/conversations?status=ACTIVE`, { headers }).then(r => r.json());
    log(`2. GET /api/conversations?status=ACTIVE → total: ${activeList.total}`);

    // ── 3. POST /init (new conversation) ──
    const init = await fetch(`${API_URL}/api/conversation/init`, {
        method: 'POST', headers, body: JSON.stringify({})
    }).then(r => r.json());
    log(`3. POST /init → conversationId: ${init.conversationId}, isNew: ${init.isNew}`);

    // ── 4. GET /api/conversation/:id ──
    const conv = await fetch(`${API_URL}/api/conversation/${init.conversationId}`, { headers }).then(r => r.json());
    log(`4. GET /conversation/:id → status: ${conv.status}, messages: ${conv.messages?.length || 0}`);

    // ── 5. POST /message (send a message) ──
    const msgRes = await fetch(`${API_URL}/api/conversation/${init.conversationId}/message`, {
        method: 'POST', headers,
        body: JSON.stringify({ message: 'Bonjour, test rapide' })
    }).then(r => r.json());
    log(`5. POST /message → reply length: ${msgRes.reply?.length || 0}, score: ${msgRes.score}`);

    // ── 6. Validation error: empty message ──
    const emptyRes = await fetch(`${API_URL}/api/conversation/${init.conversationId}/message`, {
        method: 'POST', headers,
        body: JSON.stringify({ message: '' })
    });
    log(`6. POST /message (empty) → status: ${emptyRes.status} (expected 400)`);

    // ── 7. Validation error: bad UUID ──
    const badIdRes = await fetch(`${API_URL}/api/conversation/not-a-uuid/message`, {
        method: 'POST', headers,
        body: JSON.stringify({ message: 'test' })
    });
    log(`7. POST /message (bad UUID) → status: ${badIdRes.status} (expected 400)`);

    // ── 8. PATCH /close ──
    const closeRes = await fetch(`${API_URL}/api/conversation/${init.conversationId}/close`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ status: 'CLOSED' })
    }).then(r => r.json());
    log(`8. PATCH /close → success: ${closeRes.success}, status: ${closeRes.status}`);

    // ── 9. Verify closed ──
    const closedConv = await fetch(`${API_URL}/api/conversation/${init.conversationId}`, { headers }).then(r => r.json());
    log(`9. GET after close → status: ${closedConv.status} (expected CLOSED)`);

    // ── 10. Auth error: no API key ──
    const noAuthRes = await fetch(`${API_URL}/api/conversations`);
    log(`10. GET /conversations (no key) → status: ${noAuthRes.status} (expected 401)`);

    log('\n=== TOUS LES TESTS TERMINÉS ===');
    fs.writeFileSync('test-routes-output.txt', lines.join('\n'), 'utf8');
    console.log('Done! Results in test-routes-output.txt');
}

run().catch(console.error);
