#!/usr/bin/env python3
"""Coordinator-operated evaluation. No paid calls without explicit product opt-in."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.hosted_model_evaluation import main

if __name__ == "__main__":
    raise SystemExit(main())
