import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

// ─── Types (Keeping compatibility) ───────────────────────────────────────────

export interface ManualTestSession {
    id: string;
    phase: string;
    testerProfile?: string | null;
    conversationId: string;
    startTime: Date;
    endTime?: Date | null;
    feedback?: any;
    reportFilename?: string | null;
    createdAt: Date;
    lastScore?: number | null;
    lastPriority?: string | null;
    messageCount?: number;
}

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

// ─── Service ──────────────────────────────────────────────────────────────────

export const testSessionService = {

    async startSession(data: {
        phase: string;
        testerProfile?: string;
        conversationId: string;
    }) {
        const session = await prisma.manualTestSession.create({
            data: {
                phase: data.phase,
                testerProfile: data.testerProfile,
                conversationId: data.conversationId,
            }
        });
        return { sessionId: session.id };
    },

    async submitFeedback(
        sessionId: string,
        feedback: any,
        conversationData: any
    ) {
        const lead = conversationData?.lead || {};
        const score = lead.score ?? 0;
        const priorite = lead.priorite || '—';

        const updatedSession = await prisma.manualTestSession.update({
            where: { id: sessionId },
            data: {
                feedback: feedback as any,
                endTime: new Date(),
                lastScore: score,
                lastPriority: priorite,
                messageCount: conversationData?.messages?.length || 0,
                // On garde un nom de fichier virtuel pour la compatibilité front
                reportFilename: `manual-${sessionId}.html`
            }
        });

        return { reportFilename: updatedSession.reportFilename };
    },

    async getDashboard(testerProfile?: string) {
        const sessions = await prisma.manualTestSession.findMany({
            where: testerProfile ? { testerProfile } : {},
            orderBy: { createdAt: 'desc' }
        });

        const phase1 = sessions.filter(s => s.phase === 'phase1');
        const phase2 = sessions.filter(s => s.phase === 'phase2');
        const phase3 = sessions.filter(s => s.phase === 'phase3');

        // Phase 1 stats
        const p1WithFb = phase1.filter(s => s.feedback);
        const avgNoteP1 = p1WithFb.length
            ? (p1WithFb.reduce((sum, s) => sum + Number((s.feedback as any).note || 0), 0) / p1WithFb.length).toFixed(1)
            : null;

        // Phase 2 stats
        const p2WithFb = phase2.filter(s => s.feedback);
        const avgNaturalite = p2WithFb.length
            ? (p2WithFb.reduce((sum, s) => sum + Number((s.feedback as any).note || 0), 0) / p2WithFb.length).toFixed(1)
            : null;
        const donneraitNumero = p2WithFb.length
            ? p2WithFb.filter(s => ['Oui, sans hésiter', 'Oui, probablement'].includes((s.feedback as any).confiance)).length / p2WithFb.length
            : null;

        // Phase 3 stats
        const p3WithFb = phase3.filter(s => s.feedback);
        const infosSuffisantes = p3WithFb.length
            ? p3WithFb.filter(s => (s.feedback as any).infosSuffisantes === 'Oui, tout y est').length / p3WithFb.length
            : null;

        return {
            sessions: sessions.map(s => ({
                ...s,
                sessionId: s.id, // Compatibilité front qui attend sessionId
                createdAt: s.createdAt.toISOString(),
                startTime: s.startTime.toISOString(),
                endTime: s.endTime?.toISOString()
            })),
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

    async generateReportHTML(sessionId: string, conversationData: any): Promise<string> {
        const session = await prisma.manualTestSession.findUnique({
            where: { id: sessionId }
        });

        if (!session) throw new Error('Session introuvable');

        const lead = conversationData?.lead || {};
        const projet = lead.projetData || {};
        const messages = conversationData?.messages || [];
        const score = lead.score ?? 0;
        const priorite = lead.priorite || '—';
        const now = new Date().toLocaleString('fr-FR');

        const exchanges: Array<{ role: string; content: string }> = messages.map((m: any) => ({
            role: m.role === 'user' ? 'user' : 'bot',
            content: m.content || m.text || '',
        }));

        const startMs = session.startTime.getTime();
        const endMs = session.endTime ? session.endTime.getTime() : Date.now();
        const durationSec = Math.round((endMs - startMs) / 1000);
        const durationStr = `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

        const phaseLabel = session.phase === 'phase1' ? 'Phase 1 — Développeur' : (session.phase === 'phase2' ? 'Phase 2 — Proches' : 'Phase 3 — Déménageurs Pro');

        let scoreColor = '#10b981';
        if (score < 70) scoreColor = '#f59e0b';
        if (score < 45) scoreColor = '#ef4444';

        const priorityColor = priorite === 'CHAUD' ? '#10b981' : priorite === 'TIEDE' ? '#f59e0b' : '#ef4444';

        const leadDataHtml = `
<div class="section-title">🔍 Données Extraites du Lead</div>
<table class="lead-table">
  <tr><td>Nom / Prénom</td><td><strong>${htmlEsc(lead.nom || '')} ${htmlEsc(lead.prenom || '')}</strong></td></tr>
  <tr><td>Email</td><td>${htmlEsc(lead.email || '—')}</td></tr>
  <tr><td>Téléphone</td><td>${htmlEsc(lead.telephone || '—')}</td></tr>
  <tr><td>📍 Départ</td><td>${htmlEsc(projet.villeDepart || '—')}${projet.codePostalDepart ? ' (' + htmlEsc(projet.codePostalDepart) + ')' : ''}</td></tr>
  <tr><td>📍 Arrivée</td><td>${htmlEsc(projet.villeArrivee || '—')}${projet.codePostalArrivee ? ' (' + htmlEsc(projet.codePostalArrivee) + ')' : ''}</td></tr>
  <tr><td>🏠 Surface</td><td>${projet.surface ? projet.surface + ' m²' : '—'}</td></tr>
  ${projet.nbPieces ? `<tr><td>🚪 Pièces</td><td>F${projet.nbPieces}</td></tr>` : ''}
  ${projet.volumeEstime ? `<tr><td>📦 Volume estimé</td><td>${projet.volumeEstime} m³</td></tr>` : ''}
  ${projet.etage ? `<tr><td>🏢 Étage</td><td>${htmlEsc(projet.etage)}</td></tr>` : ''}
  <tr><td>📅 Date souhaitée</td><td>${htmlEsc(projet.dateSouhaitee || '—')}</td></tr>
  <tr><td>📋 Formule</td><td>${htmlEsc(projet.formule || '—')}</td></tr>
  ${lead.creneauRappel ? `<tr><td>📞 Créneau rappel</td><td>${htmlEsc(lead.creneauRappel)}</td></tr>` : ''}
  <tr><td>Priorité calculée</td><td><span style="color:${priorityColor};font-weight:bold;cursor:help;" title="CHAUD=prioritaire, TIÈDE=intéressant, MOYEN=à suivre, FROID=peu qualifié">${priorite}</span></td></tr>
  <tr><td>Score final</td><td><strong style="color:${scoreColor};cursor:help;" title="Complétude (50pts) + Urgence (20pts) + Valeur projet (20pts) + Engagement (10pts)">${score}/100</strong></td></tr>
</table>`;

        // Récapitulatif de fin de conversation (si le bot a généré un résumé)
        let recapHtml = '';
        const recapMsg = exchanges.reverse().find(e => e.role === 'bot' && (e.content.includes('récapitulatif') || e.content.includes('VOTRE PROJET') || e.content.includes('Récap')));
        exchanges.reverse();
        if (recapMsg) {
            recapHtml = `
<div class="section-title">📋 Récapitulatif du Projet (généré par le bot)</div>
<div style="white-space:pre-line;font-size:14px;line-height:1.7;padding:12px 16px;background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.15);border-radius:10px;">${htmlEsc(recapMsg.content)}</div>`;
        }

        let feedbackHtml = '';
        const fb = session.feedback as any;
        if (session.phase === 'phase1' && fb) {
            feedbackHtml = `
<div class="section-title">🛠️ Analyse Développeur (Phase 1)</div>
<table class="lead-table">
  <tr><td>Note Qualité Chat</td><td><strong>${fb.note}/10</strong></td></tr>
  <tr><td>🐛 Problèmes Détectés</td><td style="color:var(--red)">${fb.problemes ? htmlEsc(fb.problemes) : 'Aucun'}</td></tr>
  <tr><td>💡 Suggestions</td><td style="color:var(--green)">${fb.suggestions ? htmlEsc(fb.suggestions) : 'Aucune'}</td></tr>
</table>`;
        } else if (session.phase === 'phase2' && fb) {
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
        } else if (session.phase === 'phase3' && fb) {
            feedbackHtml = `
<div class="section-title">🏢 Validation Métier (Phase 3)</div>
<table class="lead-table">
  <tr><td>Infos suffisantes ?</td><td>${htmlEsc(fb.infosSuffisantes)}</td></tr>
  ${fb.infosDetail ? `<tr><td>Précision infos</td><td>${htmlEsc(fb.infosDetail)}</td></tr>` : ''}
  <tr><td>Décision commerciale</td><td>${htmlEsc(fb.decision)}</td></tr>
  ${fb.decisionDetail ? `<tr><td>Précision décision</td><td>${htmlEsc(fb.decisionDetail)}</td></tr>` : ''}
  <tr><td>Classification OK ?</td><td>${htmlEsc(fb.classifOk)}</td></tr>
  ${fb.classifDetail ? `<tr><td>Précision classification</td><td>${htmlEsc(fb.classifDetail)}</td></tr>` : ''}
  <tr><td>Questions manquantes</td><td>${fb.questionsManquantes ? htmlEsc(fb.questionsManquantes) : '—'}</td></tr>
</table>`;
        }

        let convHtml = '';
        if (exchanges.length) {
            convHtml = `<div class="section-title">💬 Conversation (${exchanges.length} messages)</div>\n`;
            for (const ex of exchanges) {
                let content = ex.content;
                if (ex.role === 'bot') {
                    Object.keys(ACTION_LABELS).forEach(key => content = content.replace(new RegExp(key, 'g'), ''));
                }
                convHtml += `<div class="msg ${ex.role}">${htmlEsc(content.trim())}</div>\n`;
            }
        }

        let verdictClass = 'good', verdictText = `✅ Session complète — Score ${score}/100`;
        if (score < 70) { verdictClass = 'warn'; verdictText = `⚠️ Session complète — Score ${score}/100 (TIÈDE)`; }
        if (score < 45) { verdictClass = 'bad'; verdictText = `❌ Session complète — Score ${score}/100 (FROID)`; }

        return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rapport Manuel ${phaseLabel} — ${session.id}</title>
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
.verdict{font-size:17px;font-weight:700;padding:16px 24px;border-radius:12px;margin-top:32px;text-align:center}
.verdict.good{background:rgba(16,185,129,.12);color:var(--green);border:1px solid rgba(16,185,129,.3)}
.verdict.warn{background:rgba(245,158,11,.12);color:var(--amber);border:1px solid rgba(245,158,11,.3)}
.verdict.bad{background:rgba(239,68,68,.12);color:var(--red);border:1px solid rgba(239,68,68,.3)}
</style>
</head>
<body>
<div class="container">
  <h1>Rapport de Session Manuel</h1>
  <div class="subtitle">${phaseLabel} — ID: ${session.id} — ${now}</div>
  <div class="summary">
    <div class="stat"><div class="stat-value" style="color:${scoreColor}">${score}</div><div class="stat-label">Score / 100</div></div>
    <div class="stat"><div class="stat-value" style="color:${priorityColor}">${priorite}</div><div class="stat-label">Priorité</div></div>
    <div class="stat"><div class="stat-value">${exchanges.length}</div><div class="stat-label">Messages</div></div>
    <div class="stat"><div class="stat-value">${durationStr}</div><div class="stat-label">Durée</div></div>
  </div>
  <div class="card">${leadDataHtml}</div>
  ${recapHtml ? `<div class="card">${recapHtml}</div>` : ''}
  ${feedbackHtml ? `<div class="card">${feedbackHtml}</div>` : ''}
  <div class="card">${convHtml}</div>
  <div class="verdict ${verdictClass}">${verdictText}</div>
</div>
</body>
</html>`;
    }
};
