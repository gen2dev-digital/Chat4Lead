const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

async function testConnection() {
    const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
    });

    try {
        console.log('🔄 Test connexion Claude...');

        const response = await client.messages.create({
            model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
            max_tokens: 100,
            messages: [{
                role: 'user',
                content: 'Réponds juste "Connexion OK" en français.'
            }]
        });

        console.log('✅ Claude répond :', response.content[0].text);
        console.log('✅ Tokens utilisés :', response.usage);
        console.log('✅ Connexion réussie !');

    } catch (error) {
        console.error('❌ Erreur connexion :', error.message);
    }
}

testConnection();
