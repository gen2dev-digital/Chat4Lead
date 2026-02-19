#!/usr/bin/env python3
"""
Chat4Lead — Test Runner Automatisé
===================================
Exécute tous les scénarios de test contre l'API backend
et génère un rapport JSON + HTML.

Usage:
    python runner.py                   # Tous les tests
    python runner.py --id test-01      # Un seul test
    python runner.py --id test-01 test-05   # Plusieurs tests
"""

import json
import requests
import time
import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

from config import (
    API_URL, API_KEY, DELAY_BETWEEN_MESSAGES,
    TIMEOUT, SAVE_RESULTS, GENERATE_HTML_REPORT,
    RESULTS_DIR, REPORTS_DIR, SCENARIOS_FILE,
)


# ══════════════════════════════════════════════
#  COULEURS TERMINAL
# ══════════════════════════════════════════════

class Colors:
    GREEN  = '\033[92m'
    RED    = '\033[91m'
    YELLOW = '\033[93m'
    BLUE   = '\033[94m'
    CYAN   = '\033[96m'
    END    = '\033[0m'
    BOLD   = '\033[1m'
    DIM    = '\033[2m'


# ══════════════════════════════════════════════
#  CHAT BOT TESTER
# ══════════════════════════════════════════════

class ChatBotTester:
    """Exécute des scénarios de test contre l'API Chat4Lead."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'x-api-key': API_KEY,
            'Content-Type': 'application/json',
        })
        self.results: List[Dict] = []

    # ─── API helpers ──────────────────────────

    def health_check(self) -> Dict:
        """Vérifie que le backend est en ligne."""
        try:
            r = self.session.get(
                f"{API_URL.replace('/api', '')}/health",
                timeout=10,
            )
            r.raise_for_status()
            return r.json()
        except Exception as e:
            raise ConnectionError(f"Backend indisponible: {e}")

    def init_conversation(self) -> str:
        """POST /api/conversation/init → conversationId"""
        r = self.session.post(
            f"{API_URL}/conversation/init",
            json={},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        return data["conversationId"]

    def send_message(self, conversation_id: str, message: str) -> Dict:
        """POST /api/conversation/:id/message → { reply, score, … }"""
        r = self.session.post(
            f"{API_URL}/conversation/{conversation_id}/message",
            json={"message": message},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        return r.json()

    def get_conversation(self, conversation_id: str) -> Dict:
        """GET /api/conversation/:id → conversation + lead + messages"""
        r = self.session.get(
            f"{API_URL}/conversation/{conversation_id}",
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        return r.json()

    # ─── Exécution d'un scénario ──────────────

    def run_scenario(self, scenario: Dict) -> Dict:
        """Exécute un scénario de test complet et retourne le résultat."""

        sid = scenario["id"]
        print(f"\n{'═'*70}")
        print(f"  {Colors.BOLD}{Colors.CYAN}🧪  {scenario['name']}{Colors.END}  "
              f"{Colors.DIM}({sid}){Colors.END}")
        print(f"  {Colors.DIM}{scenario['description']}{Colors.END}")
        print(f"{'═'*70}")

        result: Dict[str, Any] = {
            "id": sid,
            "name": scenario["name"],
            "description": scenario["description"],
            "timestamp": datetime.now().isoformat(),
            "passed": False,
            "messages_sent": 0,
            "errors": [],
            "conversation_id": None,
            "final_score": None,
            "final_lead": None,
            "exchanges": [],
            "assertions": [],
            "duration_seconds": 0,
        }

        start = time.time()

        try:
            # 1.  Init conversation
            conversation_id = self.init_conversation()
            result["conversation_id"] = conversation_id
            print(f"\n  {Colors.GREEN}✓{Colors.END} Conversation créée: "
                  f"{Colors.DIM}{conversation_id[:12]}…{Colors.END}")

            # 2.  Envoyer les messages un par un
            last_score: Optional[int] = None
            for i, message in enumerate(scenario["messages"], 1):
                tag = f"[{i}/{len(scenario['messages'])}]"
                print(f"\n  {Colors.YELLOW}▶ USER {tag}:{Colors.END}  {message}")

                msg_start = time.time()
                response = self.send_message(conversation_id, message)
                elapsed_ms = int((time.time() - msg_start) * 1000)

                result["messages_sent"] = i

                bot_reply = response.get("reply", "")
                last_score = response.get("score")
                display_reply = bot_reply[:220] + ("…" if len(bot_reply) > 220 else "")
                print(f"  {Colors.GREEN}◀ BOT:{Colors.END}  {display_reply}")
                print(f"       {Colors.DIM}({elapsed_ms}ms | score={last_score}){Colors.END}")

                result["exchanges"].append({
                    "user": message,
                    "bot": bot_reply,
                    "score": last_score,
                    "latency_ms": elapsed_ms,
                })

                # Attendre entre les messages
                if i < len(scenario["messages"]):
                    time.sleep(DELAY_BETWEEN_MESSAGES)

            # 3.  Récupérer l'état final complet
            conversation = self.get_conversation(conversation_id)
            lead = conversation.get("lead") or {}

            result["final_score"] = lead.get("score", last_score or 0)
            result["final_lead"] = {
                "prenom":    lead.get("prenom"),
                "nom":       lead.get("nom"),
                "email":     lead.get("email"),
                "telephone": lead.get("telephone"),
                "score":     lead.get("score"),
                "priorite":  lead.get("priorite"),
                "statut":    lead.get("statut"),
                "projetData": lead.get("projetData", {}),
            }

            # Résumé visuel
            print(f"\n  {Colors.BLUE}{'─'*50}{Colors.END}")
            print(f"  {Colors.BOLD}📊 Résultats finaux{Colors.END}")
            print(f"     Score:     {Colors.BOLD}{result['final_score']}/100{Colors.END}")
            print(f"     Priorité:  {lead.get('priorite', '—')}")
            print(f"     Prénom:    {lead.get('prenom') or '—'}")
            print(f"     Nom:       {lead.get('nom') or '—'}")
            print(f"     Email:     {lead.get('email') or '—'}")
            print(f"     Téléphone: {lead.get('telephone') or '—'}")
            print(f"     Formule:   {(lead.get('projetData') or {}).get('formule', '—')}")

            # 4.  Vérification des assertions
            result["passed"] = self._check_assertions(
                scenario.get("expected", {}), result, lead
            )

        except Exception as e:
            result["errors"].append(str(e))
            print(f"\n  {Colors.RED}❌ Erreur: {e}{Colors.END}")

        result["duration_seconds"] = round(time.time() - start, 1)
        return result

    # ─── Assertions ───────────────────────────

    def _check_assertions(
        self,
        expected: Dict,
        result: Dict,
        lead: Dict,
    ) -> bool:
        """Vérifie les assertions et les ajoute au résultat."""
        assertions: List[Dict] = []
        all_passed = True
        score = result["final_score"] or 0

        print(f"\n  {Colors.BOLD}🔍 Assertions{Colors.END}")

        # ── Score minimum
        if "score_min" in expected:
            ok = score >= expected["score_min"]
            assertions.append(self._make_assert("score ≥", expected["score_min"], score, ok))
            self._print_assert(f"Score ≥ {expected['score_min']}", score, ok)
            all_passed = all_passed and ok

        # ── Score maximum
        if "score_max" in expected:
            ok = score <= expected["score_max"]
            assertions.append(self._make_assert("score ≤", expected["score_max"], score, ok))
            self._print_assert(f"Score ≤ {expected['score_max']}", score, ok)
            all_passed = all_passed and ok

        # ── Priorité
        if "priorite" in expected:
            expected_list = expected["priorite"] if isinstance(expected["priorite"], list) else [expected["priorite"]]
            actual = lead.get("priorite")
            ok = actual in expected_list
            assertions.append(self._make_assert("priorite", expected_list, actual, ok))
            self._print_assert(f"Priorité ∈ {expected_list}", actual, ok)
            all_passed = all_passed and ok

        # ── Champs collectés
        if "fields" in expected:
            for field, expected_value in expected["fields"].items():
                actual_value = lead.get(field)

                # Normalisation téléphone
                norm_actual = actual_value
                norm_expected = expected_value
                if field == "telephone" and actual_value:
                    norm_actual = actual_value.replace(" ", "").replace(".", "").replace("-", "")
                    norm_expected = expected_value.replace(" ", "").replace(".", "").replace("-", "")

                # Normalisation prénom/nom (case-insensitive)
                if field in ("prenom", "nom") and actual_value:
                    norm_actual = actual_value.strip().lower()
                    norm_expected = expected_value.strip().lower()

                ok = norm_actual == norm_expected
                assertions.append(self._make_assert(
                    f"field.{field}", expected_value, actual_value, ok
                ))
                self._print_assert(
                    f"{field} = «{expected_value}»",
                    actual_value or "(non collecté)",
                    ok,
                )
                all_passed = all_passed and ok

        result["assertions"] = assertions

        status = f"{Colors.GREEN}✅ PASS{Colors.END}" if all_passed else f"{Colors.RED}❌ FAIL{Colors.END}"
        passed_count = sum(1 for a in assertions if a["passed"])
        print(f"\n  {status} — {passed_count}/{len(assertions)} assertions réussies")

        return all_passed

    @staticmethod
    def _make_assert(type_: str, expected, actual, passed: bool) -> Dict:
        return {"type": type_, "expected": expected, "actual": actual, "passed": passed}

    @staticmethod
    def _print_assert(label: str, actual, passed: bool):
        icon = f"{Colors.GREEN}✓{Colors.END}" if passed else f"{Colors.RED}✗{Colors.END}"
        print(f"     {icon}  {label}  →  {actual}")

    # ─── Sauvegarde ───────────────────────────

    def save_results(self, results: List[Dict], filename: str):
        Path(RESULTS_DIR).mkdir(parents=True, exist_ok=True)
        filepath = Path(RESULTS_DIR) / filename
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False, default=str)
        print(f"\n{Colors.BLUE}💾  Résultats → {filepath}{Colors.END}")

    # ─── Rapport HTML ─────────────────────────

    def generate_html_report(self, results: List[Dict], filename: str):
        Path(REPORTS_DIR).mkdir(parents=True, exist_ok=True)
        filepath = Path(REPORTS_DIR) / filename

        passed_count = sum(1 for r in results if r["passed"])
        failed_count = len(results) - passed_count
        total = len(results)
        rate = (passed_count / total * 100) if total else 0
        now_str = datetime.now().strftime('%d/%m/%Y à %H:%M:%S')
        total_duration = sum(r.get("duration_seconds", 0) for r in results)

        # Badge couleur globale
        if rate >= 80:
            rate_color = "#10b981"
        elif rate >= 60:
            rate_color = "#f59e0b"
        else:
            rate_color = "#ef4444"

        # ── Construction HTML ──
        html_parts: List[str] = []
        html_parts.append(f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rapport Tests Chat4Lead — {now_str}</title>
<style>
:root {{
  --bg: #0f172a; --card: #1e293b; --border: #334155;
  --text: #e2e8f0; --muted: #94a3b8; --accent: #6366f1;
  --green: #10b981; --red: #ef4444; --amber: #f59e0b;
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{ font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }}
.container {{ max-width: 1100px; margin: 0 auto; padding: 40px 24px; }}
h1 {{ font-size: 28px; margin-bottom: 4px; }}
.subtitle {{ color: var(--muted); margin-bottom: 32px; }}

/* Summary cards */
.summary {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 40px; }}
.stat {{ background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; text-align: center; }}
.stat-value {{ font-size: 36px; font-weight: 700; }}
.stat-label {{ color: var(--muted); font-size: 13px; margin-top: 4px; text-transform: uppercase; letter-spacing: .5px; }}

/* Test cards */
.test {{ background: var(--card); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 20px; overflow: hidden; }}
.test-header {{ display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; cursor: pointer; }}
.test-header:hover {{ background: rgba(99,102,241,.06); }}
.test-name {{ font-weight: 600; font-size: 16px; }}
.test-desc {{ color: var(--muted); font-size: 13px; }}
.badge {{ display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: .5px; }}
.badge.pass {{ background: rgba(16,185,129,.15); color: var(--green); }}
.badge.fail {{ background: rgba(239,68,68,.15); color: var(--red); }}
.test-body {{ padding: 0 24px 24px; display: none; }}
.test.open .test-body {{ display: block; }}

/* Conversation */
.exchange {{ margin: 8px 0; }}
.msg {{ padding: 10px 14px; border-radius: 10px; margin: 4px 0; max-width: 85%; font-size: 14px; }}
.msg.user {{ background: var(--accent); color: #fff; margin-left: auto; text-align: right; }}
.msg.bot  {{ background: #334155; }}
.msg-meta {{ font-size: 11px; color: var(--muted); margin-top: 2px; }}

/* Assertions */
.assertion {{ display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; margin: 4px 0; font-size: 14px; }}
.assertion.pass {{ background: rgba(16,185,129,.08); }}
.assertion.fail {{ background: rgba(239,68,68,.08); }}
.assertion-icon {{ font-size: 16px; }}

/* Lead info table */
.lead-table {{ width: 100%; border-collapse: collapse; margin: 12px 0; }}
.lead-table th {{ text-align: left; padding: 8px 12px; background: rgba(99,102,241,.1); font-size: 13px; color: var(--accent); border-radius: 6px 6px 0 0; }}
.lead-table td {{ padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 14px; }}
.lead-table td:first-child {{ color: var(--muted); width: 140px; }}

.section-title {{ font-size: 14px; font-weight: 600; color: var(--accent); margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .5px; }}
</style>
</head>
<body>
<div class="container">
<h1>📊 Rapport Tests Chat4Lead</h1>
<p class="subtitle">Généré le {now_str} — Durée totale : {total_duration:.0f}s</p>

<div class="summary">
  <div class="stat"><div class="stat-value">{total}</div><div class="stat-label">Tests exécutés</div></div>
  <div class="stat"><div class="stat-value" style="color:var(--green)">{passed_count}</div><div class="stat-label">Réussis</div></div>
  <div class="stat"><div class="stat-value" style="color:var(--red)">{failed_count}</div><div class="stat-label">Échoués</div></div>
  <div class="stat"><div class="stat-value" style="color:{rate_color}">{rate:.0f}%</div><div class="stat-label">Taux de succès</div></div>
</div>
""")

        # ── Chaque test ──
        for r in results:
            cls = "pass" if r["passed"] else "fail"
            badge = "✓ PASS" if r["passed"] else "✗ FAIL"
            lead = r.get("final_lead") or {}
            projet = lead.get("projetData", {})

            html_parts.append(f"""
<div class="test" onclick="this.classList.toggle('open')">
  <div class="test-header">
    <div>
      <div class="test-name">{r['name']} <span style="color:var(--muted);font-weight:400;font-size:13px">{r['id']}</span></div>
      <div class="test-desc">{r.get('description','')}</div>
    </div>
    <span class="badge {cls}">{badge}</span>
  </div>
  <div class="test-body">

    <div class="section-title">📋 Résumé</div>
    <table class="lead-table">
      <tr><td>Messages envoyés</td><td>{r['messages_sent']}</td></tr>
      <tr><td>Score final</td><td><strong>{r.get('final_score', '—')}/100</strong></td></tr>
      <tr><td>Priorité</td><td>{lead.get('priorite','—')}</td></tr>
      <tr><td>Prénom</td><td>{lead.get('prenom') or '—'}</td></tr>
      <tr><td>Nom</td><td>{lead.get('nom') or '—'}</td></tr>
      <tr><td>Email</td><td>{lead.get('email') or '—'}</td></tr>
      <tr><td>Téléphone</td><td>{lead.get('telephone') or '—'}</td></tr>
      <tr><td>Formule</td><td>{projet.get('formule','—')}</td></tr>
      <tr><td>Durée</td><td>{r.get('duration_seconds', 0)}s</td></tr>
    </table>
""")

            # Assertions
            assertions = r.get("assertions", [])
            passed_a = sum(1 for a in assertions if a["passed"])
            html_parts.append(f"""
    <div class="section-title">🔍 Assertions ({passed_a}/{len(assertions)})</div>
""")
            for a in assertions:
                a_cls = "pass" if a["passed"] else "fail"
                icon = "✓" if a["passed"] else "✗"
                html_parts.append(f"""
    <div class="assertion {a_cls}">
      <span class="assertion-icon">{icon}</span>
      <strong>{a['type']}</strong>: attendu {a['expected']}, obtenu {a['actual']}
    </div>
""")

            # Conversation
            exchanges = r.get("exchanges", [])
            if exchanges:
                html_parts.append(f"""
    <div class="section-title">💬 Conversation ({len(exchanges)} échanges)</div>
""")
                for ex in exchanges:
                    html_parts.append(f"""
    <div class="exchange">
      <div class="msg user">{_html_esc(ex.get('user',''))}</div>
      <div class="msg bot">{_html_esc(ex.get('bot',''))}</div>
      <div class="msg-meta">{ex.get('latency_ms', '?')}ms · score={ex.get('score','—')}</div>
    </div>
""")

            # Erreurs
            if r.get("errors"):
                html_parts.append(f"""
    <div class="section-title" style="color:var(--red)">⚠️ Erreurs</div>
    <p style="color:var(--red);font-size:14px">{'<br>'.join(_html_esc(e) for e in r['errors'])}</p>
""")

            html_parts.append("  </div>\n</div>")

        # ── Footer ──
        html_parts.append("""
</div>
</body>
</html>
""")

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(''.join(html_parts))

        print(f"{Colors.BLUE}📄  Rapport HTML → {filepath}{Colors.END}")


def _html_esc(text: str) -> str:
    """Échappe les caractères HTML."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("\n", "<br>")
    )


# ══════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Chat4Lead — Test Runner")
    parser.add_argument(
        "--id", nargs="*",
        help="ID(s) de scénarii à exécuter (ex: test-01 test-05). Tous si omis.",
    )
    args = parser.parse_args()

    print(f"\n{Colors.BOLD}{Colors.CYAN}")
    print("  ╔══════════════════════════════════════════════════╗")
    print("  ║       🤖  Chat4Lead — Test Runner Automatisé    ║")
    print("  ╚══════════════════════════════════════════════════╝")
    print(f"{Colors.END}")

    # ── Charger scénarios
    try:
        with open(SCENARIOS_FILE, 'r', encoding='utf-8') as f:
            all_scenarios = json.load(f)
    except FileNotFoundError:
        print(f"{Colors.RED}❌  Fichier introuvable : {SCENARIOS_FILE}{Colors.END}")
        sys.exit(1)

    # ── Filtrer si --id fourni
    if args.id:
        scenarios = [s for s in all_scenarios if s["id"] in args.id]
        not_found = [i for i in args.id if i not in {s["id"] for s in scenarios}]
        if not_found:
            print(f"{Colors.YELLOW}⚠  IDs inconnus : {', '.join(not_found)}{Colors.END}")
        if not scenarios:
            print(f"{Colors.RED}❌  Aucun scénario trouvé.{Colors.END}")
            sys.exit(1)
    else:
        scenarios = all_scenarios

    print(f"  ✓ {len(scenarios)} scénarios chargés")
    print(f"  ✓ API : {API_URL}")

    # ── Health check
    tester = ChatBotTester()
    try:
        health = tester.health_check()
        db = health.get("database", "?")
        redis_s = health.get("redis", "?")
        print(f"  ✓ Backend en ligne — DB: {db} | Redis: {redis_s}")
    except ConnectionError as e:
        print(f"\n{Colors.RED}❌  {e}{Colors.END}")
        print(f"{Colors.DIM}   Assurez-vous que le backend tourne : npm run dev{Colors.END}")
        sys.exit(1)

    # ── Exécuter les tests
    results: List[Dict] = []
    for scenario in scenarios:
        result = tester.run_scenario(scenario)
        results.append(result)

    # ── Résumé global
    passed = sum(1 for r in results if r["passed"])
    total  = len(results)
    rate   = (passed / total * 100) if total else 0

    print(f"\n{'═'*70}")
    print(f"  {Colors.BOLD}📊  RÉSUMÉ GLOBAL{Colors.END}")
    print(f"{'═'*70}")
    print(f"  Total :       {total}")
    print(f"  {Colors.GREEN}Réussis :     {passed}{Colors.END}")
    print(f"  {Colors.RED}Échoués :     {total - passed}{Colors.END}")

    if rate >= 80:
        indicator = f"{Colors.GREEN}✅ Qualité validée{Colors.END}"
    elif rate >= 60:
        indicator = f"{Colors.YELLOW}⚠️  Ajustements mineurs recommandés{Colors.END}"
    else:
        indicator = f"{Colors.RED}❌ Optimisation prompt nécessaire{Colors.END}"

    print(f"  Taux :        {rate:.0f}%  —  {indicator}")
    print(f"{'═'*70}\n")

    # ── Sauvegarder
    ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

    if SAVE_RESULTS:
        tester.save_results(results, f"results_{ts}.json")

    if GENERATE_HTML_REPORT:
        tester.generate_html_report(results, f"report_{ts}.html")

    # ── Exit code  (0 ⇒ tous OK, 1 ⇒ au moins 1 échec)
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
