from __future__ import annotations

from .service_domains.base import ServiceBase
from .service_domains.workspace import WorkspaceServiceMixin
from .service_domains.tasks import TasksServiceMixin
from .service_domains.contracts import ContractsServiceMixin
from .service_domains.integrations import IntegrationsServiceMixin
from .service_domains.negotiation import NegotiationServiceMixin
from .service_domains.review import ReviewServiceMixin
from .service_domains.collaboration import CollaborationServiceMixin
from .service_domains.sharing import SharingServiceMixin
from .service_domains.lifecycle import LifecycleServiceMixin
from .service_domains.governance import GovernanceServiceMixin


class PlatformService(
    WorkspaceServiceMixin,
    TasksServiceMixin,
    ContractsServiceMixin,
    IntegrationsServiceMixin,
    NegotiationServiceMixin,
    ReviewServiceMixin,
    CollaborationServiceMixin,
    SharingServiceMixin,
    LifecycleServiceMixin,
    GovernanceServiceMixin,
    ServiceBase,
):
    """Compatibility facade composed from focused product-domain services."""
