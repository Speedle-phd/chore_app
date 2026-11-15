"""Allow-list of email templates: subject line and required data keys.

Each entry needs templates/<name>.html and templates/<name>.txt.
Account emails (verify, reset, invite, …) are added with the accounts phase.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Template:
    subject: str
    required: tuple[str, ...] = ()


TEMPLATES: dict[str, Template] = {
    "test": Template(subject="Hearth mail test: {name}", required=("name",)),
    "verify_email": Template(subject="Confirm your email for Hearth", required=("name", "link")),
    "reset_password": Template(subject="Reset your Hearth password", required=("name", "link")),
    "account_exists": Template(
        subject="You already have a Hearth account", required=("name", "login_link", "reset_link")
    ),
    "password_changed": Template(
        subject="Your Hearth password was changed", required=("name", "reset_link")
    ),
    "invitation": Template(
        subject="{inviter} invited you to {household} on Hearth",
        required=("inviter", "household", "link", "role", "claims"),
    ),
    "passkey_added": Template(
        subject="A passkey was added to your Hearth account", required=("name", "passkey", "link")
    ),
    "passkey_removed": Template(
        subject="A passkey was removed from your Hearth account", required=("name", "passkey", "link")
    ),
    "reminder_digest": Template(
        subject="Your Hearth reminders for {date}", required=("name", "date", "groups", "count", "link")
    ),
}
