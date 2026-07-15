from typing import Optional

from fastapi import Header, HTTPException, status

from config.environment import X_API_KEY


def x_api_auth(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> str:
    if not x_api_key or x_api_key != X_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing API Key",
        )
    return x_api_key
