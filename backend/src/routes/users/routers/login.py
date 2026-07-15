from datetime import datetime, timezone

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from config.environment import BASE_URL, TOKEN_EXPIRY_HOURS
from db.db_session import get_db
from shared import get_logger, log_error
from shared.auth import create_jwt_token, x_api_auth
from shared.utils import custom_error_response, custom_response
from src.routes.users.controllers import get_user_by_email, verify_password
from src.routes.users.models.user_profiles import UserProfile
from src.routes.users.schemas.login_request import LoginRequest

router = APIRouter()
logger = get_logger(__name__)


@router.post("/login")
async def login_user(
    request: Request,
    credentials: LoginRequest,
    db: Session = Depends(get_db),
    _x_api_key: str = Depends(x_api_auth),
):
    try:
        email = credentials.email.lower().strip()

        try:
            validate_email(email, check_deliverability=True)
        except EmailNotValidError as e:
            logger.warning("Login failed | invalid email | email=%s | %s", email, e)
            return custom_error_response(
                message="Invalid email address",
                error=str(e),
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        user = get_user_by_email(db, email)
        if not user:
            logger.warning("Login failed | user not found | email=%s", email)
            return custom_error_response(
                message="No account found with this email address",
                error="USER_NOT_FOUND",
                status_code=status.HTTP_404_NOT_FOUND,
            )

        if not verify_password(credentials.password, user.password_hash):
            logger.warning("Login failed | invalid password | email=%s", email)
            return custom_error_response(
                message="Incorrect password",
                error="INVALID_CREDENTIALS",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        if user.status == "pending":
            return custom_error_response(
                message="Your account is pending activation.",
                error="ACCOUNT_PENDING",
                status_code=status.HTTP_403_FORBIDDEN,
            )

        if user.status == "rejected":
            return custom_error_response(
                message="Your account request has been rejected.",
                error="ACCOUNT_REJECTED",
                status_code=status.HTTP_403_FORBIDDEN,
            )

        if user.status == "deactivated":
            return custom_error_response(
                message="Your account has been deactivated.",
                error="ACCOUNT_SUSPENDED",
                status_code=status.HTTP_403_FORBIDDEN,
            )

        if user.is_deleted:
            return custom_error_response(
                message="This account has been deleted",
                error="ACCOUNT_DELETED",
                status_code=status.HTTP_403_FORBIDDEN,
            )

        if user.status != "active":
            return custom_error_response(
                message="Account is not active",
                error="ACCOUNT_INACTIVE",
                status_code=status.HTTP_403_FORBIDDEN,
            )

        profile = (
            db.query(UserProfile)
            .filter(
                UserProfile.user_id == user.id,
                UserProfile.is_deleted.is_(False),
            )
            .first()
        )

        profile_image_url = None
        if profile and profile.profile_picture_url:
            profile_image_url = (
                f"{BASE_URL.rstrip('/')}/media/"
                f"{profile.profile_picture_url.lstrip('/')}"
            )

        try:
            user.last_login = datetime.now(timezone.utc)
            db.commit()
        except Exception as e:
            db.rollback()
            log_error(logger, "Failed to update last login", exception=str(e))

        access_token = create_jwt_token(
            data={
                "user_id": user.id,
                "email": user.email,
                "roles": user.roles,
            },
            expiry_minutes=TOKEN_EXPIRY_HOURS * 60,
            remember_me=credentials.remember_me,
        )

        expires_in = (
            30 * 24 * 3600 if credentials.remember_me else TOKEN_EXPIRY_HOURS * 3600
        )

        role_list = (
            [r.strip() for r in user.roles.split(",")] if user.roles else []
        )

        data = {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": expires_in,
            "user_id": user.id,
            "email": user.email,
            "display_name": user.display_name.title() if user.display_name else None,
            "roles": role_list,
            "profile_image_url": profile_image_url,
        }

        return custom_response(message="Login successful", data=data)

    except Exception as e:
        logger.exception("Unexpected login error")
        return custom_error_response(
            message="Something went wrong during login",
            error=str(e),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
