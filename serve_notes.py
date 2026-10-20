"""
Local server for the whole notes site: the module hub (index.html), every
notes page under the module folders, the past papers, and the "Ask Gemini"
panel that the notes pages embed.

Usage (from the repo root):
    python serve_notes.py
then open http://localhost:8765 (it opens automatically).

One server covers every module. A notes page calls api/health and api/chat
relative to its own folder, and any path ending in /api/health or /api/chat is
answered here, so pages work at any depth in the tree without configuration.

The Gemini API key is read from the .env file next to this script:
    GEMINI_API_KEY=your-key-here
    GEMINI_MODEL=gemini-2.5-flash

The key stays on this machine. The browser never sees it: the page sends chat
requests to this server, and the server forwards them to Google.
.env is re-read on every request, so you can edit it without restarting.
Only standard-library modules are used.
"""
import json
import os
import re
import unicodedata
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import build_manifest

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(HERE, ".env")
PAGE = "index.html"
HOST = "127.0.0.1"   # local machine only, never exposed to the network
PORT = int(os.environ.get("NOTES_PORT", "8765"))
DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta"
PER_BEER = 750000   # tokens per beer in the token ledger (see api/_ledger.js, which this mirrors)


# ---- token ledger: one amavadata report alias per person, one reading per request ----
def _ledger_url(env):
    base = (env.get("AMAVA_BASE") or "").rstrip("/")
    gw = env.get("AMAVA_GATEWAY") or ""
    return f"{base}/api/report/{urllib.parse.quote(gw)}" if base and gw else ""


def ledger_alias(name):
    clean = unicodedata.normalize("NFKD", str(name or ""))
    clean = re.sub(r"[^\w ]", "", clean, flags=re.ASCII).strip()
    clean = re.sub(r"\s+", "_", clean)[:40]
    return "tokens_" + clean if clean else ""


def ledger_report(env, name, tokens):
    url, alias = _ledger_url(env), ledger_alias(name)
    if not url or not alias or not tokens or tokens <= 0:
        return
    body = json.dumps({"alias": alias, "value": str(round(tokens))}).encode("utf-8")
    try:
        urllib.request.urlopen(urllib.request.Request(url, data=body, method="POST",
                               headers={"Content-Type": "application/json"}), timeout=5).close()
    except Exception:
        pass   # the ledger must never break the chat


def ledger_totals(env):
    url = _ledger_url(env)
    if not url:
        raise RuntimeError("The ledger is not connected yet (AMAVA_BASE and AMAVA_GATEWAY are not set).")
    with urllib.request.urlopen(url, timeout=10) as r:
        types = json.loads(r.read() or b"[]")
    people = []
    for t in types if isinstance(types, list) else []:
        alias = t.get("alias") or ""
        if not alias.startswith("tokens_"):
            continue
        values = t.get("values") or []
        tokens = sum(float(v.get("value") or 0) for v in values)
        last = max((v.get("timestamp") or "" for v in values), default="")
        people.append({"name": alias[7:].replace("_", " "), "tokens": tokens, "requests": len(values),
                       "beers": tokens / PER_BEER, "last": last})
    return sorted(people, key=lambda p: -p["tokens"])


def usage_tokens(line, last):
    """Return the token count from an SSE line carrying usageMetadata, else last."""
    if b"usageMetadata" not in line or not line.startswith(b"data:"):
        return last
    try:
        u = json.loads(line[5:]).get("usageMetadata") or {}
    except ValueError:
        return last
    return u.get("totalTokenCount") or (u.get("promptTokenCount", 0) + u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0))


def load_env():
    """Parse KEY=VALUE lines from .env (comments and blank lines ignored)."""
    env = {}
    if not os.path.exists(ENV_PATH):
        return env
    with open(ENV_PATH, encoding="utf-8-sig") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            if key.startswith("export "):
                key = key[7:].strip()
            val = val.strip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                val = val[1:-1]
            env[key] = val
    return env


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                      ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml"}

    def log_message(self, fmt, *args):  # quieter console
        if "/api/" in (self.path or ""):
            sys.stderr.write("%s\n" % (fmt % args))

    # ---- helpers -------------------------------------------------------
    def _json(self, status, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _blocked(self):
        # Never serve dotfiles or dot-folders (.env holds the key, .git the history) or the scripts.
        parts = [p for p in self.path.split("?", 1)[0].split("/") if p]
        return any(p.startswith(".") for p in parts) or (bool(parts) and parts[-1].endswith(".py"))

    def _manifest(self):
        # Rebuilt from the folder tree on every load, so a new notes file or PDF shows up on refresh.
        try:
            body = build_manifest.render(build_manifest.build()).encode("utf-8")
        except Exception as err:  # fall back to the committed manifest.js
            sys.stderr.write(f"manifest rebuild failed: {err}\n")
            return False
        self.send_response(200)
        self.send_header("Content-Type", "text/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
        return True

    # ---- GET -----------------------------------------------------------
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/manifest.js" and self._manifest():
            return
        if path.endswith("/api/health"):
            env = load_env()
            key = env.get("GEMINI_API_KEY", "")
            self._json(200, {
                "ok": True,
                "hasKey": bool(key) and "your" not in key.lower(),
                "model": env.get("GEMINI_MODEL") or DEFAULT_MODEL,
            })
            return
        if path.endswith("/api/ledger"):
            try:
                self._json(200, {"perBeer": PER_BEER, "people": ledger_totals(load_env())})
            except Exception as err:
                self._json(503, {"perBeer": PER_BEER, "error": str(err)})
            return
        if self._blocked():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if self._blocked():
            self.send_error(404)
            return
        super().do_HEAD()

    # ---- POST /api/chat -----------------------------------------------
    def do_POST(self):
        if not self.path.split("?", 1)[0].endswith("/api/chat"):
            self.send_error(404)
            return
        env = load_env()
        key = env.get("GEMINI_API_KEY", "")
        if not key or "your" in key.lower():
            self._json(400, {"error": "No Gemini API key. Put GEMINI_API_KEY=... in the .env file next to serve_notes.py (repo root), save, and try again."})
            return
        model = env.get("GEMINI_MODEL") or DEFAULT_MODEL
        base = (env.get("GEMINI_API_BASE") or DEFAULT_BASE).rstrip("/")
        try:
            length = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"error": "Bad request body."})
            return

        payload = {
            "contents": req.get("contents", []),
            "generationConfig": {"temperature": 0.4},
        }
        if isinstance(req.get("temperature"), (int, float)):   # the problem generator asks for more variety
            payload["generationConfig"]["temperature"] = min(2, max(0, req["temperature"]))
        if req.get("system"):
            payload["systemInstruction"] = {"parts": [{"text": req["system"]}]}

        url = f"{base}/models/{model}:streamGenerateContent?alt=sse"
        upstream = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-goog-api-key": key},
            method="POST",
        )
        try:
            resp = urllib.request.urlopen(upstream, timeout=300)
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", "replace")
            try:
                detail = json.loads(detail)["error"]["message"]
            except Exception:
                pass
            self._json(err.code, {"error": f"The Lovely Lady returned {err.code}: {detail}"})
            return
        except urllib.error.URLError as err:
            self._json(502, {"error": f"Could not reach The Lovely Lady: {err.reason}"})
            return

        # Relay the server-sent events stream to the page as it arrives, noting the final token count.
        user = req.get("user") if isinstance(req.get("user"), str) else ""
        tokens = 0
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            with resp:
                for line in resp:
                    self.wfile.write(line)
                    tokens = usage_tokens(line.strip(), tokens)
                    if line.strip() == b"":
                        self.wfile.flush()
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        ledger_report(env, user, tokens)


def main():
    if not os.path.exists(os.path.join(HERE, PAGE)):
        print(f"Cannot find {PAGE} next to this script.")
        sys.exit(1)
    env = load_env()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://localhost:{PORT}/"
    print(f"Serving notes at {url}")
    build_manifest.main()
    if not env.get("GEMINI_API_KEY") or "your" in env.get("GEMINI_API_KEY", "").lower():
        print("Note: GEMINI_API_KEY is not set in .env yet. The notes work; the chat will ask for the key.")
    print("Press Ctrl+C to stop.")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
