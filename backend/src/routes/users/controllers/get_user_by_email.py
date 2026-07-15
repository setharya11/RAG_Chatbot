from sqlalchemy.orm import Session

from src.routes.users.models.user_ref import UserRef


def get_user_by_email(db: Session, email: str):
    try:
        return (
            db.query(UserRef)
            .filter(UserRef.email == email, UserRef.is_deleted.is_(False))
            .first()
        )
    except Exception:
        return None
