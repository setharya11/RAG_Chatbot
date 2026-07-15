from datetime import datetime, timedelta, timezone
import secrets
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from config.environment import FRONTEND_URL
from db.db_session import get_db
from shared import get_logger, log_error
from shared.auth import x_api_auth
from shared.utils import custom_error_response, custom_response
from src.routes.users.controllers import (
    get_user_by_email,
    hash_password,
    validate_password,
)
from src.routes.users.models.user_ref import UserRef

router = APIRouter()
logger = get_logger(__name__)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


@router.post("/forgot-password")
async def forgot_password(
    request: ForgotPasswordRequest,
    db: Session = Depends(get_db),
    _x_api_key: str = Depends(x_api_auth),
):
    try:
        email = request.email.lower().strip()
        try:
            validate_email(email, check_deliverability=True)
        except EmailNotValidError as e:
            return custom_error_response(
                "Invalid email address", status_code=status.HTTP_400_BAD_REQUEST
            )

        user = get_user_by_email(db, email)
        
        # Even if user doesn't exist, return success to prevent email enumeration
        if not user:
            logger.info(f"Forgot password requested for non-existent email: {email}")
            return custom_response(
                message="If the email is registered, a password reset link has been sent.",
                data=None,
            )

        # Generate a secure token
        token = secrets.token_urlsafe(32)
        expiry = datetime.now(timezone.utc) + timedelta(hours=1)

        user.reset_token = token
        user.reset_token_expires_at = expiry
        db.commit()

        # Send email with link
        reset_link = f"{FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
        from shared.utils.email import send_password_reset_email
        send_password_reset_email(user.email, reset_link)

        return custom_response(
            message="If the email is registered, a password reset link has been sent.",
            data=None,
        )

    except Exception as e:
        logger.exception("Unexpected error during forgot password request")
        return custom_error_response(
            message="Something went wrong while processing your request",
            error=str(e),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.post("/reset-password")
async def reset_password(
    request: ResetPasswordRequest,
    db: Session = Depends(get_db),
    _x_api_key: str = Depends(x_api_auth),
):
    try:
        token = request.token.strip()
        password = request.password

        if not token:
            return custom_error_response(
                "Invalid or missing token", status_code=status.HTTP_400_BAD_REQUEST
            )

        # Find user by reset token
        user = (
            db.query(UserRef)
            .filter(
                UserRef.reset_token == token,
                UserRef.is_deleted.is_(False),
            )
            .first()
        )

        if not user:
            return custom_error_response(
                "Invalid or expired reset token",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # Check token expiration
        if user.reset_token_expires_at:
            # Ensure expires_at is timezone-aware for comparison
            expires_at = user.reset_token_expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            
            if datetime.now(timezone.utc) > expires_at:
                return custom_error_response(
                    "Password reset token has expired",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

        # Validate password strength
        is_valid, msg = validate_password(password)
        if not is_valid:
            return custom_error_response(msg, status_code=status.HTTP_400_BAD_REQUEST)

        # Update password
        user.password_hash = hash_password(password)
        user.reset_token = None
        user.reset_token_expires_at = None
        db.commit()

        return custom_response(
            message="Your password has been successfully reset. You can now log in.",
            data=None,
        )

    except Exception as e:
        logger.exception("Unexpected error during password reset")
        return custom_error_response(
            message="Something went wrong while resetting your password",
            error=str(e),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
