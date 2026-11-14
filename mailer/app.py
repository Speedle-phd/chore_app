"""Hearth mailer: renders a named email template and sends it via SMTP.

Internal service only (no published port). The backend decides *what* to send
and *when*; this service only turns {template, to, data} into an email.
"""

import hmac
import os
import smtplib
from email.message import EmailMessage
from email.utils import make_msgid

from flask import Flask, jsonify, request
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from templates_registry import TEMPLATES

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(
        MAILER_KEY=os.environ.get("MAILER_KEY", ""),
        SMTP_HOST=os.environ.get("SMTP_HOST", "mailpit"),
        SMTP_PORT=int(os.environ.get("SMTP_PORT", "1025")),
        SMTP_USER=os.environ.get("SMTP_USER", ""),
        SMTP_PASSWORD=os.environ.get("SMTP_PASSWORD", ""),
        SMTP_STARTTLS=os.environ.get("SMTP_STARTTLS", "false").lower() == "true",
        MAIL_FROM=os.environ.get("MAIL_FROM", "Hearth <no-reply@hearth.local>"),
        # Production sets this, so a missing SMTP config fails at startup instead
        # of silently sending to the dev inbox (Mailpit) that doesn't exist there.
        REQUIRE_SMTP=os.environ.get("MAILER_REQUIRE_SMTP", "false").lower() == "true",
        SMTP_CONFIGURED=bool(os.environ.get("SMTP_HOST")),
    )
    if config:
        app.config.update(config)

    # Fail fast like the backend: no weak or missing shared secret.
    if len(app.config["MAILER_KEY"]) < 32:
        raise RuntimeError("MAILER_KEY must be set and at least 32 characters")
    if app.config["REQUIRE_SMTP"] and not app.config["SMTP_CONFIGURED"]:
        raise RuntimeError("SMTP_HOST is not set: configure your email provider in mailer/.env")
    if app.config["REQUIRE_SMTP"] and not app.config["SMTP_STARTTLS"] and app.config["SMTP_USER"]:
        raise RuntimeError("SMTP_STARTTLS must be true in production: the password would be sent unencrypted")

    jinja = Environment(
        loader=FileSystemLoader(os.path.join(BASE_DIR, "templates")),
        autoescape=select_autoescape(["html"]),
        undefined=StrictUndefined,  # a missing variable is a bug, not an empty string
    )

    def authorized() -> bool:
        provided = request.headers.get("X-Mailer-Key", "")
        return hmac.compare_digest(provided.encode(), app.config["MAILER_KEY"].encode())

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    @app.post("/send")
    def send():
        if not authorized():
            return jsonify(message="Unauthorized"), 401

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify(message="Expected a JSON object"), 400

        name = payload.get("template")
        to = payload.get("to")
        data = payload.get("data")
        if data is None:
            data = {}
        template = TEMPLATES.get(name) if isinstance(name, str) else None
        if template is None:
            return jsonify(message=f"Unknown template: {name!r}"), 400
        if not isinstance(to, str) or "@" not in to or "\n" in to or "\r" in to:
            return jsonify(message="Invalid recipient"), 400
        if not isinstance(data, dict):
            return jsonify(message="'data' must be an object"), 400
        missing = [key for key in template.required if key not in data]
        if missing:
            return jsonify(message=f"Missing data: {', '.join(missing)}"), 400

        message = EmailMessage()
        # Collapse whitespace: user data in the subject must not inject headers.
        message["Subject"] = " ".join(template.subject.format(**data).split())
        message["From"] = app.config["MAIL_FROM"]
        message["To"] = to
        message["Message-ID"] = make_msgid(domain="hearth.local")
        message.set_content(jinja.get_template(f"{name}.txt").render(**data))
        message.add_alternative(
            jinja.get_template(f"{name}.html").render(**data), subtype="html"
        )

        try:
            with smtplib.SMTP(
                app.config["SMTP_HOST"], app.config["SMTP_PORT"], timeout=10
            ) as smtp:
                if app.config["SMTP_STARTTLS"]:
                    smtp.starttls()
                if app.config["SMTP_USER"]:
                    smtp.login(app.config["SMTP_USER"], app.config["SMTP_PASSWORD"])
                smtp.send_message(message)
        except (OSError, smtplib.SMTPException) as error:
            app.logger.error("SMTP delivery failed for template %s: %s", name, error)
            return jsonify(message="Email could not be delivered"), 502

        # Never log recipients' data or links: they may contain one-time tokens.
        app.logger.info("Sent template %s", name)
        return jsonify(status="sent"), 202

    return app
