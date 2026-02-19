"""
Chat4Lead - Configuration des tests automatisés
"""

import os

# ──────────────────────────────────────────────
#  Configuration API
# ──────────────────────────────────────────────
API_URL = os.getenv("API_URL", "http://localhost:3000/api")
API_KEY = os.getenv("API_KEY", "2b76dd8a-8206-4354-9ea6-cf4a8916c11e")

# ──────────────────────────────────────────────
#  Configuration des tests
# ──────────────────────────────────────────────
DELAY_BETWEEN_MESSAGES = 1.0   # secondes (le LLM a besoin de 1-3s)
TIMEOUT = 60                   # secondes max par requête
SAVE_RESULTS = True
GENERATE_HTML_REPORT = True

# ──────────────────────────────────────────────
#  Chemins
# ──────────────────────────────────────────────
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")
REPORTS_DIR = os.path.join(os.path.dirname(__file__), "reports")
SCENARIOS_FILE = os.path.join(os.path.dirname(__file__), "scenarios.json")
