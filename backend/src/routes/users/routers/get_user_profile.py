from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from config.environment import BASE_URL
from db.db_session import get_db
from shared.auth.jwt_auth_function import jwt_auth
from shared.logging import get_logger
from shared.utils import custom_error_response
from src.routes.users.models.user_profiles import UserProfile
from src.routes.users.models.user_ref import UserRef
from src.routes.users.schemas.profile_out import ProfileOut

router = APIRouter()
logger = get_logger("profile_data")


@router.get("/profile-data", response_model=ProfileOut)
def get_profile(auth_user: dict = Depends(jwt_auth), db: Session = Depends(get_db)):
    user_id = auth_user.get("user_id")
    if not user_id:
        return custom_error_response(
            "Invalid authentication token", status_code=status.HTTP_401_UNAUTHORIZED
        )

    user = (
        db.query(UserRef)
        .filter(UserRef.id == user_id, UserRef.is_deleted.is_(False))
        .first()
    )
    if not user:
        return custom_error_response("User not found", status_code=status.HTTP_404_NOT_FOUND)

    profile = (
        db.query(UserProfile)
        .filter(UserProfile.user_id == user_id, UserProfile.is_deleted.is_(False))
        .first()
    )

    full_profile_picture_url = None
    if profile and profile.profile_picture_url:
        full_profile_picture_url = (
            f"{BASE_URL.rstrip('/')}/media/"
            f"{profile.profile_picture_url.lstrip('/')}"
        )

    return ProfileOut(
        email=user.email,
        display_name=user.display_name,
        dob=user.dob,
        profile_picture_url=full_profile_picture_url,
        email_verified=user.email_verified if user.email_verified is not None else False,
    )
