from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from ..database import Database
from ..models import User
from ..object_storage import ObjectStore
from ..security import resolve_principal
from ..services import PlatformService


def get_session(request: Request):
    database: Database = request.app.state.database
    yield from database.session()


def get_store(request: Request) -> ObjectStore:
    return request.app.state.object_store


def get_platform_service(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    object_store: Annotated[ObjectStore, Depends(get_store)],
) -> PlatformService:
    return PlatformService(
        session,
        request.app.state.settings,
        object_store,
        request.app.state.review_workflow,
    )


async def read_upload(upload: UploadFile, maximum: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > maximum:
            raise HTTPException(status_code=413, detail="The uploaded document exceeds the 25 MB limit.")
        chunks.append(chunk)
    return b"".join(chunks)


def public_api_token(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        return token.strip()
    token = request.headers.get("x-lenslayer-api-key", "").strip()
    if token:
        return token
    raise HTTPException(status_code=401, detail="A LensLayer API key is required.")


def get_current_user(request: Request, service: Annotated[PlatformService, Depends(get_platform_service)]) -> User:
    return service.ensure_user(resolve_principal(request))


ServiceDep = Annotated[PlatformService, Depends(get_platform_service)]
UserDep = Annotated[User, Depends(get_current_user)]
