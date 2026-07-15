from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str
    remember_me: bool = False
