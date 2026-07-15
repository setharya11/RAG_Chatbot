from datetime import datetime, timezone

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, Form, HTTPException, status
from sqlalchemy.orm import Session

from db.db_session import get_db
from shared import get_logger, log_error
from shared.auth import x_api_auth
from shared.utils import custom_error_response, custom_response
from src.routes.users.controllers import (
    get_user_by_email,
    hash_password,
    validate_password,
)
from src.routes.users.models.user_profiles import UserProfile
from src.routes.users.models.user_ref import UserRef

router = APIRouter()
logger = get_logger(__name__)


@router.post("/signup")
async def signup(
    display_name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
    _x_api_key: str = Depends(x_api_auth),
):
    try:
        email = email.lower().strip()
        try:
            validate_email(email, check_deliverability=True)
        except EmailNotValidError as e:
            log_error(
                logger,
                "Invalid email provided during signup",
                email=email,
                exception=str(e),
            )
            return custom_error_response(
                "Invalid email address", status_code=status.HTTP_400_BAD_REQUEST
            )

        is_valid, msg = validate_password(password)
        if not is_valid:
            return custom_error_response(msg, status_code=status.HTTP_400_BAD_REQUEST)

        existing_user = get_user_by_email(db, email)
        if existing_user:
            return custom_error_response(
                "An account with this email already exists.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        hashed_password = hash_password(password)

        new_user = UserRef(
            display_name=display_name,
            email=email,
            password_hash=hashed_password,
            dob=None,
            status="active",
            email_verified=True,
            is_active=True,
            is_deleted=False,
            otp=None,
            otp_created_at=None,
            roles="user",
        )
        db.add(new_user)
        db.flush()

        profile = (
            db.query(UserProfile)
            .filter(
                UserProfile.user_id == new_user.id,
                UserProfile.is_deleted.is_(False),
            )
            .first()
        )
        if not profile:
            db.add(UserProfile(user_id=new_user.id))

        db.commit()
        db.refresh(new_user)

        return custom_response(
            message="Signup successful. You can log in now.",
            data={"user_id": new_user.id},
            status_code=status.HTTP_201_CREATED,
        )

    except Exception as e:
        log_error(logger, "Unexpected error during signup", email=email, exception=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred. Please try again.",
        ) from e
