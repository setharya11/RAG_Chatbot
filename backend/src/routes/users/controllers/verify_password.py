from passlib.context import CryptContext

password_context = CryptContext(schemes=["argon2"], deprecated="auto")


def verify_password(password: str, hashed_pass: str | None) -> bool:
    if not hashed_pass:
        return False
    try:
        return password_context.verify(password, hashed_pass)
    except Exception:
        return False
