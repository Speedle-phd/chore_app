import smtplib

import pytest

import app as mailer_app

KEY = "k" * 32


class FakeSMTP:
    """Records sent messages instead of talking to a server."""

    sent: list = []
    fail = False

    def __init__(self, host, port, timeout):
        self.host, self.port = host, port

    def __enter__(self):
        if FakeSMTP.fail:
            raise ConnectionRefusedError("no smtp")
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        pass

    def login(self, user, password):
        pass

    def send_message(self, message):
        FakeSMTP.sent.append(message)


@pytest.fixture
def client(monkeypatch):
    FakeSMTP.sent = []
    FakeSMTP.fail = False
    monkeypatch.setattr(mailer_app.smtplib, "SMTP", FakeSMTP)
    app = mailer_app.create_app({"MAILER_KEY": KEY, "TESTING": True})
    return app.test_client()


def send(client, body, key=KEY):
    return client.post("/send", json=body, headers={"X-Mailer-Key": key})


def test_refuses_to_start_without_a_strong_key():
    with pytest.raises(RuntimeError):
        mailer_app.create_app({"MAILER_KEY": "short"})


def test_production_refuses_to_start_without_smtp(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    with pytest.raises(RuntimeError, match="SMTP_HOST is not set"):
        mailer_app.create_app({"MAILER_KEY": KEY, "REQUIRE_SMTP": True, "SMTP_CONFIGURED": False})


def test_production_refuses_unencrypted_login():
    with pytest.raises(RuntimeError, match="SMTP_STARTTLS must be true"):
        mailer_app.create_app(
            {"MAILER_KEY": KEY, "REQUIRE_SMTP": True, "SMTP_CONFIGURED": True, "SMTP_USER": "u", "SMTP_STARTTLS": False}
        )


def test_health_needs_no_key(client):
    assert client.get("/health").get_json() == {"status": "ok"}


@pytest.mark.parametrize("key", ["", "wrong" * 8, KEY[:-1]])
def test_rejects_missing_or_wrong_key(client, key):
    res = send(client, {"template": "test", "to": "a@b.test", "data": {"name": "A"}}, key)
    assert res.status_code == 401
    assert FakeSMTP.sent == []


@pytest.mark.parametrize(
    "body, message",
    [
        ({"template": "nope", "to": "a@b.test"}, "Unknown template"),
        ({"template": "test", "to": "not-an-email", "data": {"name": "A"}}, "Invalid recipient"),
        ({"template": "test", "to": "a@b.test\r\nBcc: x@y.test", "data": {"name": "A"}}, "Invalid recipient"),
        ({"template": "test", "to": "a@b.test", "data": {}}, "Missing data: name"),
        ({"template": "test", "to": "a@b.test", "data": []}, "'data' must be an object"),
    ],
)
def test_validates_input(client, body, message):
    res = send(client, body)
    assert res.status_code == 400
    assert message in res.get_json()["message"]
    assert FakeSMTP.sent == []


def test_sends_html_and_text_with_escaping(client):
    res = send(client, {"template": "test", "to": "a@b.test", "data": {"name": "<b>Ann</b>"}})
    assert res.status_code == 202
    (message,) = FakeSMTP.sent
    assert message["To"] == "a@b.test"
    assert message["Subject"] == "Hearth mail test: <b>Ann</b>"
    html = message.get_body(("html",)).get_content()
    text = message.get_body(("plain",)).get_content()
    assert "&lt;b&gt;Ann&lt;/b&gt;" in html and "<b>Ann</b>" not in html
    assert "Hi <b>Ann</b>," in text  # plain text is not HTML-escaped


def test_newlines_in_data_cannot_inject_headers(client):
    res = send(client, {"template": "test", "to": "a@b.test", "data": {"name": "Ann\r\nBcc: x@y.test"}})
    assert res.status_code == 202
    (message,) = FakeSMTP.sent
    assert message["Bcc"] is None
    assert message["Subject"] == "Hearth mail test: Ann Bcc: x@y.test"


def test_smtp_failure_is_reported_as_502(client):
    FakeSMTP.fail = True
    res = send(client, {"template": "test", "to": "a@b.test", "data": {"name": "A"}})
    assert res.status_code == 502


def test_every_registered_template_has_both_parts():
    import os

    for name in mailer_app.TEMPLATES:
        for ext in ("html", "txt"):
            assert os.path.exists(os.path.join(mailer_app.BASE_DIR, "templates", f"{name}.{ext}"))
