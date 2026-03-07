from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from cv_hooks import (
    CV_HOOK_REQUEST_PAYLOAD_SHAPE,
    evaluate_cv_hook,
    parse_cv_hook_request,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="RescueSight CV hook stub service")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Bind host")
    parser.add_argument("--port", type=int, default=8091, help="Bind port")
    return parser.parse_args()


class CvServiceHandler(BaseHTTPRequestHandler):
    server_version = "RescueSightCvStub/0.1"

    def do_OPTIONS(self) -> None:
        self._send_json(204, {})

    def do_GET(self) -> None:
        if self.path != "/health":
            self._send_json(404, {"error": "Not found."})
            return
        self._send_json(
            200,
            {
                "status": "ok",
                "service": "rescuesight-cv-stub",
            },
        )

    def do_POST(self) -> None:
        if self.path != "/api/cv/evaluate":
            self._send_json(404, {"error": "Not found."})
            return

        payload = self._read_json_body()
        if payload is None:
            self._send_json(400, {"error": "Invalid JSON body."})
            return

        try:
            request = parse_cv_hook_request(payload)
        except ValueError as error:
            self._send_json(
                400,
                {
                    "error": str(error),
                    "expected": CV_HOOK_REQUEST_PAYLOAD_SHAPE,
                },
            )
            return

        response = evaluate_cv_hook(request)
        self._send_json(200, response.to_dict())

    def log_message(self, format: str, *args: Any) -> None:
        # Keep service output clean for hackathon demos and test runs.
        return

    def _read_json_body(self) -> dict[str, Any] | None:
        content_length_value = self.headers.get("Content-Length", "0")
        try:
            content_length = int(content_length_value)
        except ValueError:
            return None

        if content_length <= 0:
            return None

        body = self.rfile.read(content_length)
        try:
            parsed = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

        if not isinstance(parsed, dict):
            return None
        return parsed

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()
        self.wfile.write(body)


def build_server(host: str, port: int) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), CvServiceHandler)


def main() -> int:
    args = parse_args()
    server = build_server(args.host, args.port)
    print(f"RescueSight CV stub listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
