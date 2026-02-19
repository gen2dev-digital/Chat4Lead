import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ManualTestSession {
    sessionId: string;
    phase: 'phase1' | 'phase2' | 'phase3';
    testerProfile?: string;
    conversationId: string;
    startTime: string;
    endTime?: string;
    feedback?: Phase1Feedback | Phase2Feedback | Phase3Feedback;
    reportPath?: string;
    createdAt: string;
    leadRationale?: { score: string; priority: string };
    lastScore?: number;
    lastPriority?: string;
    messageCount?: number;
}

export interface Phase1Feedback {
    note: number;
    problemes: string;
    suggestions: string;
}

export interface Phase2Feedback {
    naturalite: string;
    comprehension: string;
    comprehensionDetail: string;
    repetition: string;
    repetitionDetail: string;
    confiance: string;
    confianceDetail: string;
    recommandation: string;
    recommandationDetail: string;
    note: number;
    plu: string;
    gene: string;
}

export interface Phase3Feedback {
    infosSuffisantes: string;
    infosDetail: string;
    decision: string;
    decisionDetail: string;
    classifOk: string;
    classifDetail: string;
    questionsManquantes: string;
    comparaisonProcess: string;
    comparaisonDetail: string;
    gainPercu: string;
    intentionAdoption: string;
    adoptionDetail: string;
    valeurPerçue: string;
    budgetMensuel: string;
    priorite1: string;
    computedScore?: number;
    computedPriority?: string;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const SESSIONS_DIR = path.join(process.cwd(), 'tests', 'manual-sessions');
const REPORTS_DIR = path.join(process.cwd(), 'tests', 'reports');

function ensureDirs() {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function sessionPath(sessionId: string) {
    return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function readSession(sessionId: string): ManualTestSession | null {
    try {
        const raw = fs.readFileSync(sessionPath(sessionId), 'utf-8');
        return JSON.parse(raw) as ManualTestSession;
    } catch {
        return null;
    }
}

function writeSession(session: ManualTestSession) {
    ensureDirs();
    fs.writeFileSync(sessionPath(session.sessionId), JSON.stringify(session, null, 2), 'utf-8');
}

function listSessions(): ManualTestSession[] {
    ensureDirs();
    try {
        return fs
            .readdirSync(SESSIONS_DIR)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                try {
                    return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8')) as ManualTestSession;
                } catch {
                    return null;
                }
            })
            .filter(Boolean) as ManualTestSession[];
    } catch {
        return [];
    }
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
    'email_notification_queued': '📧 Email notifié',
    'conversation_qualified': '✅ Qualifié',
    'crm_push_queued': '🚀 Envoyé au CRM',
    'satisfaction_request_sent': '⭐️ Avis demandé',
    'appointment_module_triggered': '📅 RDV proposé'
};

function htmlEsc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
}

// ─── Report generator ─────────────────────────────────────────────────────────

async function generateReport(
    session: ManualTestSession,
    conversationData: any
): Promise<string> {
    ensureDirs();

    const lead = conversationData?.lead || {};
    const projet = lead.projetData || {};
    const messages = conversationData?.messages || [];
    const score = lead.score ?? 0;
    const priorite = lead.priorite || '—';
    const now = new Date().toLocaleString('fr-FR');

    // Build exchanges from raw messages
    const exchanges: Array<{ role: string; content: string }> = messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'bot',
        content: m.content || m.text || '',
    }));

    // Duration
    const startMs = new Date(session.startTime).getTime();
    const endMs = session.endTime ? new Date(session.endTime).getTime() : Date.now();
    const durationSec = Math.round((endMs - startMs) / 1000);
    const durationStr = `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

    // Phase label
    const phaseLabel = session.phase === 'phase1' ? 'Phase 1 — Développeur' : (session.phase === 'phase2' ? 'Phase 2 — Proches' : 'Phase 3 — Déménageurs Pro');

    // Score color
    let scoreColor = '#10b981';
    if (score < 70) scoreColor = '#f59e0b';
    if (score < 45) scoreColor = '#ef4444';

    // Priority badge
    const priorityColor = priorite === 'CHAUD' ? '#10b981' : priorite === 'TIEDE' ? '#f59e0b' : '#ef4444';

    // ── Lead data summary (for all phases) ──
    const leadDataHtml = `
<div class="section-title">🔍 Données Extraites du Lead</div>
<table class="lead-table">
  <tr><td>Nom / Prénom</td><td><strong>${htmlEsc(lead.nom || '')} ${htmlEsc(lead.prenom || '')}</strong></td></tr>
  <tr><td>Email</td><td>${htmlEsc(lead.email || '—')}</td></tr>
  <tr><td>Téléphone</td><td>${htmlEsc(lead.telephone || '—')}</td></tr>
  <tr><td>Départ</td><td>${htmlEsc(projet.villeDepart || '—')} (${htmlEsc(projet.codePostalDepart || '')})</td></tr>
  <tr><td>Arrivée</td><td>${htmlEsc(projet.villeArrivee || '—')} (${htmlEsc(projet.codePostalArrivee || '')})</td></tr>
  <tr><td>Surface</td><td>${projet.surface ? projet.surface + ' m²' : '—'}</td></tr>
  <tr><td>Date souhaitée</td><td>${htmlEsc(projet.dateSouhaitee || '—')}</td></tr>
  <tr><td>Formule</td><td>${htmlEsc(projet.formule || '—')}</td></tr>
  <tr><td>Priorité calculée</td><td title="${htmlEsc(session.leadRationale?.priority || '')}"><span style="color:${priorityColor};font-weight:bold;cursor:help;">${priorite} ℹ️</span></td></tr>
  <tr><td>Score final</td><td title="${htmlEsc(session.leadRationale?.score || '')}"><strong style="color:${scoreColor}; cursor:help;">${score}/100 ℹ️</strong></td></tr>
</table>`;

    // ── Feedback section ──
    let feedbackHtml = '';
    if (session.phase === 'phase1' && session.feedback) {
        const fb = session.feedback as Phase1Feedback;
        feedbackHtml = `
<div class="section-title">🛠️ Analyse Développeur (Phase 1)</div>
<table class="lead-table">
  <tr><td>Note Qualité Chat</td><td><strong>${fb.note}/10</strong></td></tr>
  <tr><td>🐛 Problèmes Détectés</td><td style="color:var(--red)">${fb.problemes ? htmlEsc(fb.problemes) : 'Aucun'}</td></tr>
  <tr><td>💡 Suggestions</td><td style="color:var(--green)">${fb.suggestions ? htmlEsc(fb.suggestions) : 'Aucune'}</td></tr>
</table>`;
    } else if (session.phase === 'phase2' && session.feedback) {
        const fb = session.feedback as Phase2Feedback;
        feedbackHtml = `
<div class="section-title">💭 Feedback UX (Phase 2)</div>
<table class="lead-table">
  <tr><td>Naturalité</td><td><strong>${htmlEsc(fb.naturalite)}</strong></td></tr>
  <tr><td>Compréhension</td><td>${htmlEsc(fb.comprehension)}</td></tr>
  ${fb.comprehensionDetail ? `<tr><td>Détail Compr.</td><td>${htmlEsc(fb.comprehensionDetail)}</td></tr>` : ''}
  <tr><td>Répétitions ?</td><td>${htmlEsc(fb.repetition)}</td></tr>
  ${fb.repetitionDetail ? `<tr><td>Détail Répét.</td><td>${htmlEsc(fb.repetitionDetail)}</td></tr>` : ''}
  <tr><td>Confiance / Coordonnées</td><td>${htmlEsc(fb.confiance)}</td></tr>
  ${fb.confianceDetail ? `<tr><td>Détail Conf.</td><td>${htmlEsc(fb.confianceDetail)}</td></tr>` : ''}
  <tr><td>Recommandation</td><td>${htmlEsc(fb.recommandation)}</td></tr>
  ${fb.recommandationDetail ? `<tr><td>Détail Intention</td><td>${htmlEsc(fb.recommandationDetail)}</td></tr>` : ''}
  <tr><td>Note Expérience</td><td><strong>${fb.note}/10</strong></td></tr>
  <tr><td>Points forts</td><td>${fb.plu ? htmlEsc(fb.plu) : '—'}</td></tr>
  <tr><td>Points gênants</td><td>${fb.gene ? htmlEsc(fb.gene) : '—'}</td></tr>
</table>`;
    } else if (session.phase === 'phase3' && session.feedback) {
        const fb = session.feedback as Phase3Feedback;
        feedbackHtml = `
<div class="section-title">🏢 Validation Métier (Phase 3)</div>
<div style="font-size:12px; color:var(--muted); margin-bottom:15px; border-bottom:1px solid var(--border); padding-bottom:5px;">BLOC 1 : QUALITÉ DU LEAD</div>
<table class="lead-table">
  <tr><td>Infos suffisantes ?</td><td>${htmlEsc(fb.infosSuffisantes)}</td></tr>
  ${fb.infosDetail ? `<tr><td>Précision infos</td><td>${htmlEsc(fb.infosDetail)}</td></tr>` : ''}
  <tr><td>Décision commerciale</td><td>${htmlEsc(fb.decision)}</td></tr>
  ${fb.decisionDetail ? `<tr><td>Précision décision</td><td>${htmlEsc(fb.decisionDetail)}</td></tr>` : ''}
  <tr><td>Classification OK ?</td><td>${htmlEsc(fb.classifOk)}</td></tr>
  ${fb.classifDetail ? `<tr><td>Précision classification</td><td>${htmlEsc(fb.classifDetail)}</td></tr>` : ''}
  <tr><td>Questions manquantes</td><td>${fb.questionsManquantes ? htmlEsc(fb.questionsManquantes) : '—'}</td></tr>
</table>

<div style="font-size:12px; color:var(--muted); margin:20px 0 10px; border-bottom:1px solid var(--border); padding-bottom:5px;">BLOC 2 : INTÉRÊT COMMERCIAL</div>
<table class="lead-table">
  <tr><td>Process actuel</td><td>${htmlEsc(fb.comparaisonProcess)}</td></tr>
  ${fb.comparaisonDetail ? `<tr><td>Détail process</td><td>${htmlEsc(fb.comparaisonDetail)}</td></tr>` : ''}
  <tr><td>Gain perçu</td><td>${htmlEsc(fb.gainPercu)}</td></tr>
  <tr><td>Intention d'adoption</td><td>${htmlEsc(fb.intentionAdoption)}</td></tr>
  ${fb.adoptionDetail ? `<tr><td>Précision adoption</td><td>${htmlEsc(fb.adoptionDetail)}</td></tr>` : ''}
</table>

<div style="font-size:12px; color:var(--muted); margin:20px 0 10px; border-bottom:1px solid var(--border); padding-bottom:5px;">BLOC 3 : BUDGET & VALEUR</div>
<table class="lead-table">
  <tr><td>Valeur perçue</td><td>${htmlEsc(fb.valeurPerçue)}</td></tr>
  <tr><td>Budget mensuel</td><td>${htmlEsc(fb.budgetMensuel)}</td></tr>
</table>

<div style="font-size:12px; color:var(--muted); margin:20px 0 10px; border-bottom:1px solid var(--border); padding-bottom:5px;">BLOC 4 : AMÉLIORATION</div>
<table class="lead-table">
  <tr><td>Priorité #1</td><td><strong>${fb.priorite1 ? htmlEsc(fb.priorite1) : '—'}</strong></td></tr>
</table>`;
    }

    // ── Conversation ──
    let convHtml = '';
    if (exchanges.length) {
        convHtml = `<div class="section-title">💬 Conversation (${exchanges.length} messages)</div>\n`;
        for (const ex of exchanges) {
            // Filter out system actions from bot messages for cleaner display
            let content = ex.content;
            if (ex.role === 'bot') {
                Object.keys(ACTION_LABELS).forEach(key => {
                    content = content.replace(new RegExp(key, 'g'), '');
                });
            }
            convHtml += `<div class="msg ${ex.role}">${htmlEsc(content.trim())}</div>\n`;
        }
    }

    // ── Verdict ──
    let verdictClass = 'good', verdictText = `✅ Session complète — Score ${score}/100`;
    if (score < 70) { verdictClass = 'warn'; verdictText = `⚠️ Session complète — Score ${score}/100 (TIÈDE)`; }
    if (score < 45) { verdictClass = 'bad'; verdictText = `❌ Session complète — Score ${score}/100 (FROID)`; }

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rapport Manuel ${phaseLabel} — ${session.sessionId}</title>
<style>
:root{--bg:#0f172a;--card:#1e293b;--border:#334155;--text:#e2e8f0;--muted:#94a3b8;--accent:#6366f1;--green:#10b981;--red:#ef4444;--amber:#f59e0b}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
.container{max-width:1000px;margin:0 auto;padding:40px 24px}
h1{font-size:26px;margin-bottom:4px}
.subtitle{color:var(--muted);margin-bottom:32px;font-size:14px}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:40px}
.stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center}
.stat-value{font-size:32px;font-weight:700}
.stat-label{color:var(--muted);font-size:12px;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:20px}
.section-title{font-size:13px;font-weight:600;color:var(--accent);margin:20px 0 10px;text-transform:uppercase;letter-spacing:.5px}
.lead-table{width:100%;border-collapse:collapse}
.lead-table td{padding:8px 12px;border-bottom:1px solid var(--border);font-size:14px}
.lead-table td:first-child{color:var(--muted);width:180px}
.msg{padding:10px 14px;border-radius:10px;margin:4px 0;max-width:85%;font-size:14px;word-wrap:break-word;line-height:1.5}
.msg.user{background:var(--accent);color:#fff;margin-left:auto;text-align:right}
.msg.bot{background:#334155}
.badge-phase{display:inline-block;background:rgba(99,102,241,.15);color:var(--accent);border:1px solid rgba(99,102,241,.3);padding:4px 14px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:12px}
.verdict{font-size:17px;font-weight:700;padding:16px 24px;border-radius:12px;margin-top:32px;text-align:center}
.verdict.good{background:rgba(16,185,129,.12);color:var(--green);border:1px solid rgba(16,185,129,.3)}
.verdict.warn{background:rgba(245,158,11,.12);color:var(--amber);border:1px solid rgba(245,158,11,.3)}
.verdict.bad{background:rgba(239,68,68,.12);color:var(--red);border:1px solid rgba(239,68,68,.3)}
.priority-badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700}
</style>
</head>
<body>
<div class="container">
  <h1>Rapport de Session Manuel</h1>
  <div class="subtitle">${phaseLabel} — ID: ${session.sessionId} — ${now}</div>

  <div class="summary">
    <div class="stat" title="${htmlEsc(session.leadRationale?.score || '')}" style="cursor:help">
      <div class="stat-value" style="color:${scoreColor}">${score}</div>
      <div class="stat-label">Score / 100 ℹ️</div>
    </div>
    <div class="stat" title="${htmlEsc(session.leadRationale?.priority || '')}" style="cursor:help">
      <div class="stat-value" style="color:${priorityColor}">${priorite}</div>
      <div class="stat-label">Priorité ℹ️</div>
    </div>
    <div class="stat">
      <div class="stat-value">${exchanges.length}</div>
      <div class="stat-label">Messages</div>
    </div>
    <div class="stat">
      <div class="stat-value">${durationStr}</div>
      <div class="stat-label">Durée</div>
    </div>
  </div>

  <div class="card">
    ${leadDataHtml}
  </div>

  ${feedbackHtml ? `<div class="card">${feedbackHtml}</div>` : ''}

  <div class="card">
    ${convHtml}
  </div>

  <div class="verdict ${verdictClass}">${verdictText}</div>
</div>
</body>
</html>`;

    const filename = `manual-${session.phase}-${session.sessionId}.html`;
    const reportFilePath = path.join(REPORTS_DIR, filename);
    fs.writeFileSync(reportFilePath, html, 'utf-8');
    return filename;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const testSessionService = {

    startSession(data: {
        phase: 'phase1' | 'phase2' | 'phase3';
        testerProfile?: string;
        conversationId: string;
    }): ManualTestSession {
        const sessionId = `${data.phase}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const session: ManualTestSession = {
            sessionId,
            phase: data.phase,
            testerProfile: data.testerProfile,
            conversationId: data.conversationId,
            startTime: new Date().toISOString(),
            createdAt: new Date().toISOString(),
        };
        writeSession(session);
        return session;
    },

    async submitFeedback(
        sessionId: string,
        feedback: Phase1Feedback | Phase2Feedback | Phase3Feedback,
        conversationData: any
    ): Promise<{ reportFilename: string }> {
        const session = readSession(sessionId);
        if (!session) throw new Error(`Session ${sessionId} introuvable`);

        const lead = conversationData?.lead || {};
        const score = lead.score ?? 0;
        const priorite = lead.priorite || '—';

        // Generate scoring rationale
        session.leadRationale = {
            score: `Score de ${score}/100 basé sur les informations collectées (Identité, Volume, Lieux, etc.).`,
            priority: `Priorité ${priorite} calculée selon le score et la nature du projet (B2B, Budget, Urgence).`
        };

        session.lastScore = score;
        session.lastPriority = priorite;
        session.messageCount = conversationData?.messages?.length || 0;

        session.feedback = feedback;
        session.endTime = new Date().toISOString();

        const reportFilename = await generateReport(session, conversationData);
        session.reportPath = reportFilename;
        writeSession(session);

        return { reportFilename };
    },

    getDashboard(testerProfile?: string) {
        let sessions = listSessions();

        // Filter by tester profile if provided (Phase 3 requirement)
        if (testerProfile) {
            sessions = sessions.filter(s => s.testerProfile === testerProfile);
        }

        const phase1 = sessions.filter(s => s.phase === 'phase1');
        const phase2 = sessions.filter(s => s.phase === 'phase2');
        const phase3 = sessions.filter(s => s.phase === 'phase3');

        // Phase 1 stats
        const p1WithFb = phase1.filter(s => s.feedback) as Array<ManualTestSession & { feedback: Phase1Feedback }>;
        const avgNoteP1 = p1WithFb.length
            ? (p1WithFb.reduce((sum, s) => sum + Number(s.feedback.note || 0), 0) / p1WithFb.length).toFixed(1)
            : null;

        // Success criteria for P1: Score > 70
        // We'll mock this for now or use the actual last score if stored. 
        // Let's assume sessions tracking score would be better. For now count feedbacks.

        // Phase 2 stats
        const p2WithFb = phase2.filter(s => s.feedback) as Array<ManualTestSession & { feedback: Phase2Feedback }>;
        const avgNaturalite = p2WithFb.length
            ? (p2WithFb.reduce((sum, s) => sum + Number((s.feedback as Phase2Feedback).note || 0), 0) / p2WithFb.length).toFixed(1)
            : null;
        const donneraitNumero = p2WithFb.length
            ? p2WithFb.filter(s => ['Oui, sans hésiter', 'Oui, probablement'].includes((s.feedback as Phase2Feedback).confiance)).length / p2WithFb.length
            : null;

        // Phase 3 stats
        const p3WithFb = phase3.filter(s => s.feedback) as Array<ManualTestSession & { feedback: Phase3Feedback }>;
        const infosSuffisantes = p3WithFb.length
            ? p3WithFb.filter(s => (s.feedback as Phase3Feedback).infosSuffisantes === 'Oui, tout y est').length / p3WithFb.length
            : null;

        return {
            sessions,
            stats: {
                phase1: {
                    total: phase1.length,
                    withFeedback: p1WithFb.length,
                    avgNote: avgNoteP1,
                    successCount: phase1.filter(s => (s.lastScore || 0) >= 70).length,
                    failCount: phase1.filter(s => s.endTime && (s.lastScore || 0) < 70).length
                },
                phase2: {
                    total: phase2.length,
                    withFeedback: p2WithFb.length,
                    avgNaturalite,
                    pctDonneraitNumero: donneraitNumero !== null ? Math.round(donneraitNumero * 100) : null,
                },
                phase3: {
                    total: phase3.length,
                    withFeedback: p3WithFb.length,
                    pctInfosSuffisantes: infosSuffisantes !== null ? Math.round(infosSuffisantes * 100) : null,
                },
            },
        };
    },
};
