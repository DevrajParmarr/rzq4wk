"""Vercel serverless entry point.

Vercel serves the built React app from frontend/dist and routes /api/* here
(see vercel.json). The FastAPI app itself lives in backend/app.
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402

__all__ = ["app"]
