from datetime import date

from pydantic import BaseModel, EmailStr


class ProfileOut(BaseModel):
    email: EmailStr
    display_name: str | None
    dob: date | None
    profile_picture_url: str | None
    email_verified: bool

    model_config = {"from_attributes": True}
