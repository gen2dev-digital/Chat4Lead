import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('Connexion à la base de données...');

    const leads = await prisma.lead.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
            conversation: {
                include: {
                    messages: true
                }
            }
        }
    });

    const reportDir = path.join(process.cwd(), 'tests', 'reports');
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }

    const timestamp = new Date();
    const filename = `manual_leads_report_${timestamp.toISOString().replace(/[:.]/g, '-')}.html`;
    const reportPath = path.join(reportDir, filename);

    console.log(`Génération du rapport HTML pour ${leads.length} leads...`);

    const htmlContent = generateHtmlReport(leads, timestamp);

    fs.writeFileSync(reportPath, htmlContent);
    console.log(`\n✅ Rapport HTML généré avec succès : ${reportPath}`);
}

function generateHtmlReport(leads, date) {
    const stats = {
        total: leads.length,
        qualified: leads.filter(l => l.score >= 70).length,
        avgScore: Math.round(leads.reduce((acc, l) => acc + l.score, 0) / (leads.length || 1)),
        withEmail: leads.filter(l => l.email).length,
        withPhone: leads.filter(l => l.telephone).length
    };

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Rapport Conversations Manuelles - Chat4Lead</title>
    <style>
        :root {
            --bg-color: #f8fafc;
            --card-bg: #ffffff;
            --text-primary: #1e293b;
            --text-secondary: #64748b;
            --accent: #4f46e5;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
            --border: #e2e8f0;
        }
        body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg-color); color: var(--text-primary); margin: 0; padding: 20px; line-height: 1.5; }
        .container { max-width: 1200px; margin: 0 auto; }
        header { margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
        h1 { font-size: 24px; font-weight: 700; color: var(--text-primary); margin: 0; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
        .badge-success { background: #dcfce7; color: #166534; }
        .badge-warning { background: #fef3c7; color: #92400e; }
        .badge-danger { background: #fee2e2; color: #991b1b; }
        
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
        .stat-card { background: var(--card-bg); padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid var(--border); }
        .stat-value { font-size: 28px; font-weight: 700; color: var(--accent); }
        .stat-label { font-size: 13px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 5px; }

        .leads-table { width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        th { text-align: left; padding: 16px; background: #f1f5f9; font-size: 12px; text-transform: uppercase; color: var(--text-secondary); font-weight: 600; }
        td { padding: 16px; border-top: 1px solid var(--border); font-size: 14px; vertical-align: middle; }
        tr:hover { background: #f8fafc; transition: background 0.2s; }
        
        .details-row { display: none; background: #f8f9fa; }
        .details-container { padding: 20px; font-family: monospace; font-size: 12px; color: var(--text-secondary); overflow-x: auto; }
        .toggle-btn { 
            background: transparent; 
            border: 1px solid var(--accent); 
            color: var(--accent); 
            cursor: pointer; 
            font-weight: 600; 
            font-size: 11px; 
            padding: 4px 8px; 
            border-radius: 6px;
            transition: all 0.2s;
        }
        .toggle-btn:hover { background: var(--accent); color: white; }
        
        .score-circle { 
            width: 36px; height: 36px; 
            border-radius: 50%; 
            display: flex; align-items: center; justify-content: center; 
            font-weight: 700; font-size: 13px; 
        }
    </style>
    <script>
        function toggleDetails(id) {
            const row = document.getElementById('details-' + id);
            if (row.style.display === 'table-row') {
                row.style.display = 'none';
            } else {
                row.style.display = 'table-row';
            }
        }
    </script>
</head>
<body>
    <div class="container">
        <header>
            <div>
                <h1>📊 Rapport Conversations Manuelles</h1>
                <p style="color: var(--text-secondary); margin: 5px 0 0 0;">Généré le ${date.toLocaleString('fr-FR')}</p>
            </div>
            <div>
                <span class="badge badge-success">Live Data</span>
            </div>
        </header>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${stats.total}</div>
                <div class="stat-label">Total Conversations</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.qualified}</div>
                <div class="stat-label">Leads Qualifiés (>70)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.avgScore}/100</div>
                <div class="stat-label">Score Moyen</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.withPhone}</div>
                <div class="stat-label">Téléphones Capturés</div>
            </div>
        </div>

        <table class="leads-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Client / Type</th>
                    <th>Trajet / Surface</th>
                    <th>Volume Estimé</th>
                    <th>Contact</th>
                    <th>Score</th>
                    <th>Avis</th>
                    <th>Détails</th>
                </tr>
            </thead>
            <tbody>
                ${leads.map(lead => {
        const data = lead.projetData || {};
        const scoreBg = lead.score >= 80 ? '#dcfce7' : lead.score >= 50 ? '#fef3c7' : '#fee2e2';
        const scoreColor = lead.score >= 80 ? '#166534' : lead.score >= 50 ? '#92400e' : '#991b1b';

        const messagesCount = lead.conversation?.messages?.length || 0;

        return `
                    <tr>
                        <td style="color: var(--text-secondary); font-size: 12px;">
                            ${new Date(lead.createdAt).toLocaleString('fr-FR')}
                        </td>
                        <td>
                            <div style="font-weight: 600; color: var(--text-primary);">${lead.prenom || ''} ${lead.nom || 'Inconnu'}</div>
                            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${lead.type || 'PARTICULIER'}</div>
                        </td>
                        <td>
                            <div style="font-weight: 500;">${data.villeDepart || '?'} ➝ ${data.villeArrivee || '?'}</div>
                            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${data.surface ? data.surface + 'm²' : ''}</div>
                        </td>
                        <td>
                            <span class="badge" style="background: #e0e7ff; color: #4338ca;">
                                ${data.volumeEstime ? data.volumeEstime + ' m³' : '?'}
                            </span>
                        </td>
                        <td>
                            <div style="font-weight: 500;"> ${lead.telephone || '-'}</div>
                            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${lead.email || '-'}</div>
                        </td>
                        <td>
                            <div class="score-circle" style="background: ${scoreBg}; color: ${scoreColor};">
                                ${lead.score}
                            </div>
                        </td>
                        <td>
                            ${lead.satisfactionScore ? '⭐ ' + lead.satisfactionScore + '/5' : '-'}
                        </td>
                        <td>
                            <button class="toggle-btn" onclick="toggleDetails('${lead.id}')">JSON (${messagesCount} msgs)</button>
                        </td>
                    </tr>
                    <tr id="details-${lead.id}" class="details-row">
                        <td colspan="8">
                            <div class="details-container">
                                <strong>DONNÉES COMPLÈTES (JSON) :</strong><br>
                                <pre>${JSON.stringify(lead, null, 2)}</pre>
                            </div>
                        </td>
                    </tr>
                    `;
    }).join('')}
            </tbody>
        </table>
    </div>
</body>
</html>
    `;
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
