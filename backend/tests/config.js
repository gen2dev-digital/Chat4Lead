/**
 * Chat4Lead — Configuration des tests automatisés
 */

module.exports = {
    // ── API ──
    API_URL: process.env.API_URL || 'http://localhost:3000/api',
    API_KEY: process.env.API_KEY || '2b76dd8a-8206-4354-9ea6-cf4a8916c11e',

    // ── Timing ──
    DELAY_BETWEEN_MESSAGES: 1500,   // ms (le LLM prend 1-3s pour répondre)
    TIMEOUT: 60000,                 // ms par requête

    // ── Output ──
    SAVE_RESULTS: true,
    GENERATE_HTML_REPORT: true,
};
