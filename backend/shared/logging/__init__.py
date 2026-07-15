import logging
import sys


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s - %(levelname)s - %(name)s - %(message)s"
            )
        )
        logger.addHandler(handler)
        logger.propagate = False
    return logger


def log_error(logger: logging.Logger, message: str, **extra):
    logger.error("%s | %s", message, extra, exc_info=True)


__all__ = ["get_logger", "log_error"]
