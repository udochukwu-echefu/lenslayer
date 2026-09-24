from __future__ import annotations

from fastapi import APIRouter, Response, status

from ..schemas import (
    InvitationAcceptResponse,
    InvitationCreate,
    InvitationCreatedResponse,
    InvitationPreviewResponse,
    InvitationResponse,
    MembershipResponse,
    MembershipRoleUpdate,
    OrganizationCreate,
    OrganizationResponse,
    OrganizationSettingsResponse,
    OrganizationSettingsUpdate,
    UserResponse,
)
from .dependencies import ServiceDep, UserDep


router = APIRouter()


@router.get("/me", response_model=UserResponse, tags=["identity"])
def me(
    user: UserDep,
) -> UserResponse:
    return UserResponse.model_validate(user)


@router.post(
    "/organizations",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["organizations"],
)
def create_organization(
    payload: OrganizationCreate,
    service: ServiceDep,
    user: UserDep,
) -> OrganizationResponse:
    organization = service.create_organization(user, payload.name, payload.slug)
    return OrganizationResponse.model_validate(organization).model_copy(update={"role": "owner"})


@router.get("/organizations", response_model=list[OrganizationResponse], tags=["organizations"])
def list_organizations(
    service: ServiceDep,
    user: UserDep,
) -> list[OrganizationResponse]:
    return [
        OrganizationResponse.model_validate(organization).model_copy(update={"role": role})
        for organization, role in service.list_organizations(user)
    ]


@router.get(
    "/organizations/{organization_id}/settings",
    response_model=OrganizationSettingsResponse,
    tags=["organizations"],
)
def get_organization_settings(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
) -> OrganizationSettingsResponse:
    settings_value = service.organization_settings(organization_id, user)
    return service.organization_settings_response(settings_value)


@router.patch(
    "/organizations/{organization_id}/settings",
    response_model=OrganizationSettingsResponse,
    tags=["organizations"],
)
def update_organization_settings(
    organization_id: str,
    payload: OrganizationSettingsUpdate,
    service: ServiceDep,
    user: UserDep,
) -> OrganizationSettingsResponse:
    settings_value = service.update_organization_settings(
        organization_id,
        user,
        payload.model_dump(exclude_unset=True),
    )
    return service.organization_settings_response(settings_value)


@router.get(
    "/organizations/{organization_id}/members",
    response_model=list[MembershipResponse],
    tags=["team"],
)
def list_members(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[MembershipResponse]:
    return [service.membership_response(item) for item in service.list_members(organization_id, user)]


@router.patch(
    "/organizations/{organization_id}/members/{membership_id}",
    response_model=MembershipResponse,
    tags=["team"],
)
def update_member_role(
    organization_id: str,
    membership_id: str,
    payload: MembershipRoleUpdate,
    service: ServiceDep,
    user: UserDep,
) -> MembershipResponse:
    membership = service.update_member_role(organization_id, membership_id, payload.role, user)
    return service.membership_response(membership)


@router.delete(
    "/organizations/{organization_id}/members/{membership_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["team"],
)
def remove_member(
    organization_id: str,
    membership_id: str,
    service: ServiceDep,
    user: UserDep,
) -> Response:
    service.remove_member(organization_id, membership_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/organizations/{organization_id}/invitations",
    response_model=list[InvitationResponse],
    tags=["team"],
)
def list_invitations(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[InvitationResponse]:
    return [service.invitation_response(item) for item in service.list_invitations(organization_id, user)]


@router.post(
    "/organizations/{organization_id}/invitations",
    response_model=InvitationCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["team"],
)
def create_invitation(
    organization_id: str,
    payload: InvitationCreate,
    service: ServiceDep,
    user: UserDep,
) -> InvitationCreatedResponse:
    invitation, token = service.create_invitation(organization_id, user, payload.email, payload.role)
    return InvitationCreatedResponse(invitation=service.invitation_response(invitation), token=token)


@router.delete(
    "/organizations/{organization_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["team"],
)
def revoke_invitation(
    organization_id: str,
    invitation_id: str,
    service: ServiceDep,
    user: UserDep,
) -> Response:
    service.revoke_invitation(organization_id, invitation_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/invitations/{token}",
    response_model=InvitationPreviewResponse,
    tags=["team"],
)
def preview_invitation(
    token: str,
    service: ServiceDep,
) -> InvitationPreviewResponse:
    return service.invitation_preview(service.find_invitation(token))


@router.post(
    "/invitations/{token}/accept",
    response_model=InvitationAcceptResponse,
    tags=["team"],
)
def accept_invitation(
    token: str,
    service: ServiceDep,
    user: UserDep,
) -> InvitationAcceptResponse:
    organization, membership = service.accept_invitation(token, user)
    organization_response = OrganizationResponse.model_validate(organization).model_copy(
        update={"role": membership.role}
    )
    return InvitationAcceptResponse(
        organization=organization_response,
        membership=service.membership_response(membership),
    )
