from fastapi import APIRouter

from src.routes.users.routers.get_user_profile import router as profile_data
from src.routes.users.routers.login import router as user_login_router
from src.routes.users.routers.signup import router as user_signup_router
from src.routes.users.routers.update_user_profile import router as update_profile
from src.routes.users.routers.forgot_password import router as forgot_password_router

router = APIRouter()

router.include_router(user_login_router, prefix="/api", tags=["Users"])
router.include_router(user_signup_router, prefix="/api", tags=["Users"])
router.include_router(forgot_password_router, prefix="/api", tags=["Users"])
router.include_router(profile_data, tags=["Users Profile"])
router.include_router(update_profile, tags=["Users Profile"])
