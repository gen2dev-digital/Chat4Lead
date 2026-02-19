#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════
 *  Chat4Lead — Test Runner Automatisé (Node.js)
 * ══════════════════════════════════════════════
 *
 * Usage:
 *   node runner.mjs                        # Tous les tests
 *   node runner.mjs --id test-01           # Un seul test
 *   node runner.mjs --id test-01 test-05   # Plusieurs tests
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ──
const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const API_KEY = process.env.API_KEY || '2b76dd8a-8206-4354-9ea6-cf4a8916c11e';
const DELAY_MS = 2500;   // délai entre messages (passage à 2.5s)
const TIMEOUT = 120000; // timeout par requête (passage à 120s)

// ── Couleurs terminal ──
const C = {
    g: '\x1b[92m', r: '\x1b[91m', y: '\x1b[93m', b: '\x1b[94m',
    c: '\x1b[96m', d: '\x1b[2m', B: '\x1b[1m', _: '\x1b[0m',
};

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiFetch(method, urlPath, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);

    const opts = {
        method,
        headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
        signal: controller.signal,
    };
    if (body) opts.body = JSON.stringify(body);

    try {
        const res = await fetch(`${API_URL}${urlPath}`, opts);
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text}`);
        }
        return res.json();
    } finally {
        clearTimeout(timer);
    }
}

function htmlEsc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
}

// ═══════════════════════════════════════════════
//  RUN A SINGLE SCENARIO
// ═══════════════════════════════════════════════

async function runScenario(scenario) {
    const { id, name, description, messages, expected } = scenario;

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  ${C.B}${C.c}🧪  ${name}${C._}  ${C.d}(${id})${C._}`);
    console.log(`  ${C.d}${description}${C._}`);
    console.log(`${'═'.repeat(70)}`);

    const result = {
        id, name, description,
        timestamp: new Date().toISOString(),
        passed: false,
        messages_sent: 0,
        errors: [],
        conversation_id: null,
        final_score: null,
        final_lead: null,
        exchanges: [],
        assertions: [],
        duration_seconds: 0,
    };

    const t0 = Date.now();

    try {
        // 1.  Init conversation
        const init = await apiFetch('POST', '/conversation/init', {});
        const convId = init.conversationId;
        result.conversation_id = convId;
        console.log(`\n  ${C.g}✓${C._} Conversation créée: ${C.d}${convId.slice(0, 12)}…${C._}`);

        // 2.  Envoyer les messages un par un
        let lastScore = null;
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const tag = `[${i + 1}/${messages.length}]`;
            console.log(`\n  ${C.y}▶ USER ${tag}:${C._}  ${msg}`);

            const mStart = Date.now();
            const res = await apiFetch('POST', `/conversation/${convId}/message`, { message: msg });
            const elapsedMs = Date.now() - mStart;

            result.messages_sent = i + 1;
            const reply = res.reply || '';
            lastScore = res.score ?? lastScore;
            const display = reply.length > 220 ? reply.slice(0, 220) + '…' : reply;
            console.log(`  ${C.g}◀ BOT:${C._}  ${display}`);
            console.log(`       ${C.d}(${elapsedMs}ms | score=${lastScore})${C._}`);

            result.exchanges.push({ user: msg, bot: reply, score: lastScore, latency_ms: elapsedMs });

            if (i < messages.length - 1) await sleep(DELAY_MS);
        }

        // 3.  État final
        const conv = await apiFetch('GET', `/conversation/${convId}`);
        const lead = conv.lead || {};

        result.final_score = lead.score ?? lastScore ?? 0;
        result.final_lead = {
            prenom: lead.prenom || null,
            nom: lead.nom || null,
            email: lead.email || null,
            telephone: lead.telephone || null,
            score: lead.score,
            priorite: lead.priorite,
            statut: lead.statut,
            projetData: lead.projetData || {},
        };

        console.log(`\n  ${C.b}${'─'.repeat(50)}${C._}`);
        console.log(`  ${C.B}📊 Résultats finaux${C._}`);
        console.log(`     Score:     ${C.B}${result.final_score}/100${C._}`);
        console.log(`     Priorité:  ${lead.priorite || '—'}`);
        console.log(`     Prénom:    ${lead.prenom || '—'}`);
        console.log(`     Nom:       ${lead.nom || '—'}`);
        console.log(`     Email:     ${lead.email || '—'}`);
        console.log(`     Téléphone: ${lead.telephone || '—'}`);
        console.log(`     Formule:   ${(lead.projetData || {}).formule || '—'}`);

        // 4.  Assertions
        result.passed = checkAssertions(expected || {}, result, lead);

    } catch (e) {
        result.errors.push(e.message || String(e));
        console.log(`\n  ${C.r}❌ Erreur: ${e.message}${C._}`);
    }

    result.duration_seconds = +((Date.now() - t0) / 1000).toFixed(1);
    return result;
}

// ═══════════════════════════════════════════════
//  ASSERTIONS
// ═══════════════════════════════════════════════

function checkAssertions(expected, result, lead) {
    const assertions = [];
    let allOk = true;
    const score = result.final_score || 0;

    console.log(`\n  ${C.B}🔍 Assertions${C._}`);

    // ── Score min
    if (expected.score_min != null) {
        const ok = score >= expected.score_min;
        assertions.push(mkAssert('score ≥', expected.score_min, score, ok));
        logAssert(`Score ≥ ${expected.score_min}`, score, ok);
        allOk = allOk && ok;
    }

    // ── Score max
    if (expected.score_max != null) {
        const ok = score <= expected.score_max;
        assertions.push(mkAssert('score ≤', expected.score_max, score, ok));
        logAssert(`Score ≤ ${expected.score_max}`, score, ok);
        allOk = allOk && ok;
    }

    // ── Priorité
    if (expected.priorite != null) {
        const list = Array.isArray(expected.priorite) ? expected.priorite : [expected.priorite];
        const actual = lead.priorite;
        const ok = list.includes(actual);
        assertions.push(mkAssert('priorite', list, actual, ok));
        logAssert(`Priorité ∈ [${list.join(', ')}]`, actual, ok);
        allOk = allOk && ok;
    }

    // ── Champs
    if (expected.fields) {
        for (const [field, expVal] of Object.entries(expected.fields)) {
            let actual = lead[field];
            let normAct = actual, normExp = expVal;

            if (field === 'telephone' && actual) {
                normAct = actual.replace(/[\s.\-]/g, '');
                normExp = expVal.replace(/[\s.\-]/g, '');
            }
            if (['prenom', 'nom'].includes(field) && actual) {
                normAct = actual.trim().toLowerCase();
                normExp = expVal.trim().toLowerCase();
            }

            const ok = normAct === normExp;
            assertions.push(mkAssert(`field.${field}`, expVal, actual, ok));
            logAssert(`${field} = «${expVal}»`, actual || '(non collecté)', ok);
            allOk = allOk && ok;
        }
    }

    result.assertions = assertions;

    const pc = assertions.filter(a => a.passed).length;
    const status = allOk
        ? `${C.g}✅ PASS${C._}`
        : `${C.r}❌ FAIL${C._}`;
    console.log(`\n  ${status} — ${pc}/${assertions.length} assertions réussies`);

    return allOk;
}

function mkAssert(type, expected, actual, passed) {
    return { type, expected, actual, passed };
}

function logAssert(label, actual, ok) {
    const icon = ok ? `${C.g}✓${C._}` : `${C.r}✗${C._}`;
    console.log(`     ${icon}  ${label}  →  ${actual}`);
}

// ═══════════════════════════════════════════════
//  SAVE RESULTS JSON
// ═══════════════════════════════════════════════

function saveResults(results, ts) {
    const dir = path.join(__dirname, 'results');
    fs.mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, `results_${ts}.json`);
    fs.writeFileSync(fp, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n${C.b}💾  Résultats → ${fp}${C._}`);
}

// ═══════════════════════════════════════════════
//  GENERATE HTML REPORT
// ═══════════════════════════════════════════════

function generateHtmlReport(results, ts) {
    const dir = path.join(__dirname, 'reports');
    fs.mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, `report_${ts}.html`);

    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    const total = results.length;
    const rate = total ? Math.round(passed / total * 100) : 0;
    const now = new Date().toLocaleString('fr-FR');
    const totalDuration = results.reduce((s, r) => s + (r.duration_seconds || 0), 0).toFixed(0);

    let rateColor = '#10b981';
    if (rate < 80) rateColor = '#f59e0b';
    if (rate < 60) rateColor = '#ef4444';

    let html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rapport Tests Chat4Lead — ${now}</title>
<style>
:root{--bg:#0f172a;--card:#1e293b;--border:#334155;--text:#e2e8f0;--muted:#94a3b8;--accent:#6366f1;--green:#10b981;--red:#ef4444;--amber:#f59e0b}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
.container{max-width:1100px;margin:0 auto;padding:40px 24px}
h1{font-size:28px;margin-bottom:4px}
.subtitle{color:var(--muted);margin-bottom:32px}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:40px}
.stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;text-align:center}
.stat-value{font-size:36px;font-weight:700}
.stat-label{color:var(--muted);font-size:13px;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
.test{background:var(--card);border:1px solid var(--border);border-radius:12px;margin-bottom:20px;overflow:hidden}
.test-header{display:flex;justify-content:space-between;align-items:center;padding:20px 24px;cursor:pointer;transition:background .15s}
.test-header:hover{background:rgba(99,102,241,.06)}
.test-name{font-weight:600;font-size:16px}
.test-desc{color:var(--muted);font-size:13px}
.badge{display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:.5px}
.badge.pass{background:rgba(16,185,129,.15);color:var(--green)}
.badge.fail{background:rgba(239,68,68,.15);color:var(--red)}
.test-body{padding:0 24px 24px;display:none}
.test.open .test-body{display:block}
.exchange{margin:8px 0}
.msg{padding:10px 14px;border-radius:10px;margin:4px 0;max-width:85%;font-size:14px;word-wrap:break-word}
.msg.user{background:var(--accent);color:#fff;margin-left:auto;text-align:right}
.msg.bot{background:#334155}
.msg-meta{font-size:11px;color:var(--muted);margin-top:2px}
.assertion{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;margin:4px 0;font-size:14px}
.assertion.pass{background:rgba(16,185,129,.08)}
.assertion.fail{background:rgba(239,68,68,.08)}
.assertion-icon{font-size:16px}
.lead-table{width:100%;border-collapse:collapse;margin:12px 0}
.lead-table td{padding:8px 12px;border-bottom:1px solid var(--border);font-size:14px}
.lead-table td:first-child{color:var(--muted);width:140px}
.section-title{font-size:14px;font-weight:600;color:var(--accent);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px}
.verdict{font-size:18px;font-weight:700;padding:16px 24px;border-radius:12px;margin-top:32px;text-align:center}
.verdict.good{background:rgba(16,185,129,.12);color:var(--green);border:1px solid rgba(16,185,129,.3)}
.verdict.warn{background:rgba(245,158,11,.12);color:var(--amber);border:1px solid rgba(245,158,11,.3)}
.verdict.bad{background:rgba(239,68,68,.12);color:var(--red);border:1px solid rgba(239,68,68,.3)}
</style>
</head>
<body>
<div class="container">
<h1>📊 Rapport Tests Chat4Lead</h1>
<p class="subtitle">Généré le ${now} — Durée totale : ${totalDuration}s</p>

<div class="summary">
  <div class="stat"><div class="stat-value">${total}</div><div class="stat-label">Tests exécutés</div></div>
  <div class="stat"><div class="stat-value" style="color:var(--green)">${passed}</div><div class="stat-label">Réussis</div></div>
  <div class="stat"><div class="stat-value" style="color:var(--red)">${failed}</div><div class="stat-label">Échoués</div></div>
  <div class="stat"><div class="stat-value" style="color:${rateColor}">${rate}%</div><div class="stat-label">Taux de succès</div></div>
</div>
`;

    for (const r of results) {
        const cls = r.passed ? 'pass' : 'fail';
        const badge = r.passed ? '✓ PASS' : '✗ FAIL';
        const lead = r.final_lead || {};
        const projet = lead.projetData || {};

        html += `
<div class="test" onclick="this.classList.toggle('open')">
  <div class="test-header">
    <div>
      <div class="test-name">${htmlEsc(r.name)} <span style="color:var(--muted);font-weight:400;font-size:13px">${r.id}</span></div>
      <div class="test-desc">${htmlEsc(r.description || '')}</div>
    </div>
    <span class="badge ${cls}">${badge}</span>
  </div>
  <div class="test-body">

    <div class="section-title">📋 Résumé</div>
    <table class="lead-table">
      <tr><td>Messages envoyés</td><td>${r.messages_sent}</td></tr>
      <tr><td>Score final</td><td><strong>${r.final_score ?? '—'}/100</strong></td></tr>
      <tr><td>Priorité</td><td>${lead.priorite || '—'}</td></tr>
      <tr><td>Prénom</td><td>${lead.prenom || '—'}</td></tr>
      <tr><td>Nom</td><td>${lead.nom || '—'}</td></tr>
      <tr><td>Email</td><td>${lead.email || '—'}</td></tr>
      <tr><td>Téléphone</td><td>${lead.telephone || '—'}</td></tr>
      <tr><td>Formule</td><td>${projet.formule || '—'}</td></tr>
      <tr><td>Durée</td><td>${r.duration_seconds}s</td></tr>
    </table>
`;

        // Assertions
        const pa = (r.assertions || []).filter(a => a.passed).length;
        const ta = (r.assertions || []).length;
        html += `\n    <div class="section-title">🔍 Assertions (${pa}/${ta})</div>\n`;
        for (const a of (r.assertions || [])) {
            const ac = a.passed ? 'pass' : 'fail';
            const icon = a.passed ? '✓' : '✗';
            html += `    <div class="assertion ${ac}"><span class="assertion-icon">${icon}</span><strong>${htmlEsc(a.type)}</strong>: attendu ${htmlEsc(JSON.stringify(a.expected))}, obtenu ${htmlEsc(JSON.stringify(a.actual))}</div>\n`;
        }

        // Conversation
        const exch = r.exchanges || [];
        if (exch.length) {
            html += `\n    <div class="section-title">💬 Conversation (${exch.length} échanges)</div>\n`;
            for (const ex of exch) {
                html += `    <div class="exchange">
      <div class="msg user">${htmlEsc(ex.user)}</div>
      <div class="msg bot">${htmlEsc(ex.bot)}</div>
      <div class="msg-meta">${ex.latency_ms}ms · score=${ex.score ?? '—'}</div>
    </div>\n`;
            }
        }

        // Errors
        if (r.errors && r.errors.length) {
            html += `\n    <div class="section-title" style="color:var(--red)">⚠️ Erreurs</div>\n`;
            html += `    <p style="color:var(--red);font-size:14px">${r.errors.map(htmlEsc).join('<br>')}</p>\n`;
        }

        html += `  </div>\n</div>\n`;
    }

    // Verdict global
    let verdictClass = 'good', verdictText = `✅ Qualité validée — ${rate}% de réussite`;
    if (rate < 80) { verdictClass = 'warn'; verdictText = `⚠️ Ajustements recommandés — ${rate}% de réussite`; }
    if (rate < 60) { verdictClass = 'bad'; verdictText = `❌ Optimisation prompt nécessaire — ${rate}% de réussite`; }

    html += `
<div class="verdict ${verdictClass}">${verdictText}</div>
</div>
</body>
</html>`;

    fs.writeFileSync(fp, html, 'utf-8');
    console.log(`${C.b}📄  Rapport HTML → ${fp}${C._}`);
    return fp;
}

// ═══════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════

async function main() {
    // Parse args
    const args = process.argv.slice(2);
    let filterIds = null;
    const idIdx = args.indexOf('--id');
    if (idIdx !== -1) {
        filterIds = [];
        for (let i = idIdx + 1; i < args.length && !args[i].startsWith('--'); i++) {
            filterIds.push(args[i]);
        }
    }

    console.log(`\n${C.B}${C.c}`);
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║       🤖  Chat4Lead — Test Runner Automatisé    ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log(`${C._}\n`);

    // ── Charger scénarios ──
    const scenIdx = args.indexOf('--scenarios');
    let scenariosFile = 'scenarios.json';
    if (scenIdx !== -1 && args[scenIdx + 1]) {
        scenariosFile = args[scenIdx + 1];
    }

    const scenariosPath = path.join(__dirname, scenariosFile);
    let allScenarios;
    try {
        allScenarios = JSON.parse(fs.readFileSync(scenariosPath, 'utf-8'));
    } catch (e) {
        console.log(`${C.r}❌  Fichier introuvable : ${scenariosPath}${C._}`);
        process.exit(1);
    }

    // ── Filtrer
    let scenarios = allScenarios;
    if (filterIds) {
        scenarios = allScenarios.filter(s => filterIds.includes(s.id));
        const found = new Set(scenarios.map(s => s.id));
        const notFound = filterIds.filter(i => !found.has(i));
        if (notFound.length) console.log(`${C.y}⚠  IDs inconnus : ${notFound.join(', ')}${C._}`);
        if (!scenarios.length) { console.log(`${C.r}❌  Aucun scénario trouvé.${C._}`); process.exit(1); }
    }

    console.log(`  ✓ ${scenarios.length} scénarios chargés`);
    console.log(`  ✓ API : ${API_URL}`);

    // ── Health check
    try {
        const healthUrl = API_URL.replace('/api', '') + '/health';
        const hRes = await fetch(healthUrl, { signal: AbortSignal.timeout(10000) });
        const health = await hRes.json();
        console.log(`  ✓ Backend en ligne — DB: ${health.database} | Redis: ${health.redis}`);
    } catch (e) {
        console.log(`\n${C.r}❌  Backend indisponible: ${e.message}${C._}`);
        console.log(`${C.d}   Assurez-vous que le backend tourne : npm run dev${C._}`);
        process.exit(1);
    }

    // ── Exécuter les tests
    const results = [];
    const DELAY_BETWEEN_SCENARIOS = 20000; // 20 seconds between scenarios to avoid 429 (passage à 20s)

    for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];
        const result = await runScenario(scenario);
        results.push(result);

        if (i < scenarios.length - 1) {
            console.log(`\n${C.y}⏳ Attente de ${DELAY_BETWEEN_SCENARIOS / 1000}s avant le prochain scénario...${C._}`);
            await sleep(DELAY_BETWEEN_SCENARIOS);
        }
    }

    // ── Résumé global
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const rate = total ? Math.round(passed / total * 100) : 0;

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  ${C.B}📊  RÉSUMÉ GLOBAL${C._}`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`  Total :       ${total}`);
    console.log(`  ${C.g}Réussis :     ${passed}${C._}`);
    console.log(`  ${C.r}Échoués :     ${total - passed}${C._}`);

    let indicator;
    if (rate >= 80) indicator = `${C.g}✅ Qualité validée${C._}`;
    else if (rate >= 60) indicator = `${C.y}⚠️  Ajustements mineurs recommandés${C._}`;
    else indicator = `${C.r}❌ Optimisation prompt nécessaire${C._}`;

    console.log(`  Taux :        ${rate}%  —  ${indicator}`);
    console.log(`${'═'.repeat(70)}\n`);

    // ── Sauvegarder
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    saveResults(results, ts);
    const reportPath = generateHtmlReport(results, ts);

    // ── Ouvrir le rapport automatiquement
    try {
        const { exec } = await import('child_process');
        exec(`start "" "${reportPath}"`);
    } catch { /* ignore */ }

    process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
});
