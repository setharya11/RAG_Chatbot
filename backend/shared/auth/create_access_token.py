from datetime import datetime, timedelta, timezone
import jwt
from config.environment import JWT_ALGORITHM, SECRET_KEY


def create_jwt_token(
    data: dict, expiry_minutes: int = 30, remember_me: bool = False
):
    payload = data.copy()
    now = datetime.now(timezone.utc)

    if remember_me:
        expiry = now + timedelta(days=30)
    else:
        expiry = now + timedelta(minutes=expiry_minutes)

    payload["exp"] = expiry
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_jwt_token(token: str):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def decode_jwt_token(token: str) -> dict | None:
    return verify_jwt_token(token)
