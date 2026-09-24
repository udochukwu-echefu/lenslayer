"""HTTP adapters grouped by product domain; business rules live in service_domains."""

from fastapi import APIRouter

from . import (
    collaboration,
    contracts,
    governance,
    integrations,
    lifecycle,
    negotiation,
    public_api,
    review,
    sharing,
    tasks,
    workspace,
)
from .health import router as health_router

router = APIRouter()
router.include_router(workspace.router)
router.include_router(tasks.router)
router.include_router(contracts.router)
router.include_router(review.router)
router.include_router(integrations.router)
router.include_router(public_api.router)
router.include_router(negotiation.router)
router.include_router(sharing.router)
router.include_router(collaboration.router)
router.include_router(governance.router)
router.include_router(lifecycle.router)
