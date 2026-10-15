"""Run local unittest suites without loading dotenv or real environment files.

Usage: .venv/bin/python scripts/test-agent-generalization-local.py [test modules]
With no modules, discover the Python regression suite. Provider HTTP in agent
integration suites is mocked; this runner never establishes live-provider proof.
"""
from pathlib import Path
import os
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Do not allow an inherited provider opt-in or credential to turn a local suite
# into a live test. Tests may install their own fake environment values later.
for name in list(os.environ):
    if name.startswith(("LENSLAYER_", "OPENAI_", "DEEPSEEK_", "GROQ_", "GOOGLE_", "AWS_", "RESEND_")):
        del os.environ[name]
os.environ["LENSLAYER_TEST_POSTGRES_ACK"] = "disabled"
os.environ["LENSLAYER_SANDBOX_GOOGLE_ACK"] = "disabled"

import dotenv

dotenv.load_dotenv = lambda *args, **kwargs: False
from backend.app.config import Settings

Settings.model_config["env_file"] = None

if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = (loader.loadTestsFromNames(sys.argv[1:]) if len(sys.argv) > 1
             else loader.discover("tests"))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(not result.wasSuccessful())
