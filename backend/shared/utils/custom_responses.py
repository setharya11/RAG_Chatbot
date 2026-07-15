from fastapi.responses import JSONResponse


def custom_error_response(
    message: str, error=None, status_code: int = 500
):
    if isinstance(error, int):
        status_code = error
        error = None

    error_message = str(error) if error is not None else message

    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "status": status_code,
            "message": message,
            "error": error_message,
        },
    )


def custom_response(message: str, data: dict | None = None, status_code: int = 200):
    return {
        "success": True,
        "status": status_code,
        "message": message,
        "data": data,
    }
