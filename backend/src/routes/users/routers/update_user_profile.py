import os
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from config.environment import BASE_URL, MEDIA_PATH
from db.db_session import get_db
from shared.auth.jwt_auth_function import jwt_auth
from shared.logging import get_logger
from shared.utils import custom_error_response
from src.routes.users.models.user_profiles import UserProfile
from src.routes.users.models.user_ref import UserRef
from src.routes.users.schemas.profile_out import ProfileOut

router = APIRouter()
logger = get_logger(__name__)

PROFILE_PIC_DIR = os.path.join(MEDIA_PATH, "profile_pictures")
os.makedirs(PROFILE_PIC_DIR, exist_ok=True)


@router.patch("/update-profile", response_model=ProfileOut, status_code=status.HTTP_200_OK)
def update_profile(
    display_name: str | None = Form(None),
    dob: date | None = Form(None, description="Date format: YYYY-MM-DD"),
    profile_picture: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(jwt_auth),
):
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    user = (
        db.query(UserRef)
        .filter(UserRef.id == user_id, UserRef.is_deleted.is_(False))
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    profile = (
        db.query(UserProfile)
        .filter(UserProfile.user_id == user_id, UserProfile.is_deleted.is_(False))
        .first()
    )
    if not profile:
        profile = UserProfile(user_id=user_id)
        db.add(profile)
        db.flush()

    if display_name is not None:
        user.display_name = display_name.strip()

    if dob is not None:
        user.dob = dob

    if profile_picture:
        if profile_picture.content_type not in (
            "image/jpeg",
            "image/png",
            "image/webp",
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid image type",
            )
        ext = os.path.splitext(profile_picture.filename or "")[1] or ".jpg"
        filename = f"user_{user_id}_{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(PROFILE_PIC_DIR, filename)
        with open(file_path, "wb") as f:
            f.write(profile_picture.file.read())
        profile.profile_picture_url = f"profile_pictures/{filename}"

    db.commit()
    db.refresh(user)
    db.refresh(profile)

    full_url = None
    if profile.profile_picture_url:
        full_url = (
            f"{BASE_URL.rstrip('/')}/media/"
            f"{profile.profile_picture_url.lstrip('/')}"
        )

    return ProfileOut(
        email=user.email,
        display_name=user.display_name,
        dob=user.dob,
        profile_picture_url=full_url,
        email_verified=user.email_verified if user.email_verified is not None else False,
    )
