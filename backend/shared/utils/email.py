import smtplib
from email.mime.text import MIMEText
import logging
from config.environment import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, APP_NAME

logger = logging.getLogger(__name__)

def send_password_reset_email(to_email: str, reset_link: str) -> bool:
    subject = f"[{APP_NAME}] Password Reset Request"
    body = (
        f"Hello,\n\n"
        f"You requested to reset your password for {APP_NAME}.\n"
        f"Please click on the link below or paste it into your browser to reset your password:\n\n"
        f"{reset_link}\n\n"
        f"This link will expire in 1 hour.\n\n"
        f"If you did not request this, please ignore this email.\n"
    )

    # Log email content for local development/fallback
    dev_msg = (
        f"\n================ DEVELOPMENT EMAIL SENDER ================\n"
        f"To: {to_email}\n"
        f"Subject: {subject}\n"
        f"Body:\n{body}"
        f"=========================================================="
    )
    logger.info(dev_msg)
    print(dev_msg)  # Ensure it prints to terminal console

    # If no user/password configured, treat logging as success for local dev
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.info("SMTP credentials not configured. Email logged to console.")
        return True

    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to_email

        # Connect to SMTP server
        # For port 587, we connect, then issue starttls()
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
        if SMTP_PORT == 587:
            server.starttls()
        
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, [to_email], msg.as_string())
        server.close()
        logger.info(f"Password reset email sent to {to_email} via SMTP.")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email} via SMTP: {e}")
        # Return True as fallback so the API doesn't crash, but log it
        return False
