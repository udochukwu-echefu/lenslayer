"""ASGI entry point; explicit application factories need not load a local .env."""
from .application import create_app

app = create_app()
