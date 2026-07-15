# pyrefly: ignore [missing-import]
from sqlalchemy import Boolean, Column, Date, Integer, Text
# pyrefly: ignore [missing-import]
from sqlalchemy.dialects.postgresql import TIMESTAMP
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import relationship
# pyrefly: ignore [missing-import]
from sqlalchemy.sql import func

from db import Base
from shared.logging import get_logger

logger = get_logger(__name__)


class UserRef(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)

    email = Column(Text, unique=True, nullable=False)
    password_hash = Column(Text, nullable=True)
    display_name = Column(Text, nullable=True)

    dob = Column(Date, nullable=True)
    created_by_admin = Column(Boolean, default=False, nullable=False)

    status = Column(Text, default="pending", nullable=False)
    email_verified = Column(Boolean, default=False)
    otp = Column(Text, nullable=True)
    last_login = Column(TIMESTAMP(timezone=True), nullable=True)
    otp_created_at = Column(TIMESTAMP(timezone=True), nullable=True)
    reset_token = Column(Text, nullable=True)
    reset_token_expires_at = Column(TIMESTAMP(timezone=True), nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

    created_at = Column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    roles = Column(Text, nullable=True)

    user_profile = relationship(
        "UserProfile",
        back_populates="users",
        uselist=False,
        cascade="all, delete-orphan",
    )
