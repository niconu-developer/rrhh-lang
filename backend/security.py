import base64
import hashlib
import hmac
import secrets

from .settings import PASSWORD_ITERATIONS

PASSWORD_PREFIX = "pbkdf2_sha256"


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", str(password).encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return "$".join([
        PASSWORD_PREFIX,
        str(PASSWORD_ITERATIONS),
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    ])


def is_password_hash(value):
    return str(value or "").startswith(f"{PASSWORD_PREFIX}$")


def verify_password(password, stored_hash):
    stored = str(stored_hash or "")
    if not is_password_hash(stored):
        return hmac.compare_digest(stored, str(password))
    try:
        _, iterations, salt_b64, digest_b64 = stored.split("$", 3)
        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected = base64.b64decode(digest_b64.encode("ascii"))
        actual = hashlib.pbkdf2_hmac("sha256", str(password).encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def token_hash(token):
    return hashlib.sha256(str(token).encode("utf-8")).hexdigest()
