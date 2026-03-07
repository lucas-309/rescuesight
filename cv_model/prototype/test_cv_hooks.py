from __future__ import annotations

import json
import threading
import unittest
from urllib import error as url_error
from urllib import request as url_request

from cv_hooks import evaluate_cv_hook, parse_cv_hook_request
from cv_service import build_server


def _sample_signal(**overrides: object) -> dict[str, object]:
    signal: dict[str, object] = {
        "handPlacementStatus": "correct",
        "placementConfidence": 0.9,
        "compressionRateBpm": 110,
        "compressionRhythmQuality": "good",
        "visibility": "full",
        "frameTimestampMs": 123456,
        "bodyPosture": "lying",
        "postureConfidence": 0.82,
        "eyesClosedConfidence": 0.66,
        "torsoInclineDeg": 18.0,
    }
    signal.update(overrides)
    return signal


class TestCvHooks(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = build_server("127.0.0.1", 0)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=2.0)

    def test_evaluate_hook_maps_adjustment_directives(self) -> None:
        request = parse_cv_hook_request(
            {
                "signal": _sample_signal(
                    handPlacementStatus="too_left",
                    compressionRateBpm=92,
                    compressionRhythmQuality="too_slow",
                )
            }
        )
        response = evaluate_cv_hook(request)

        self.assertEqual(response.handPlacementHint.directive, "move_right")
        self.assertEqual(response.compressionHint.directive, "speed_up")
        self.assertTrue(response.requiresUserConfirmation)
        checkpoint_ids = {checkpoint.id for checkpoint in response.checkpoints}
        self.assertIn("hand_adjusted", checkpoint_ids)
        self.assertIn("compression_adjusted", checkpoint_ids)

    def test_person_down_checkpoint_can_be_acknowledged(self) -> None:
        first = evaluate_cv_hook(
            parse_cv_hook_request({"signal": _sample_signal()})
        )
        self.assertIn(first.personDownHint.status, {"likely", "possible"})
        self.assertTrue(first.requiresUserConfirmation)
        self.assertIn(
            "person_down_confirmed",
            {checkpoint.id for checkpoint in first.checkpoints},
        )

        second = evaluate_cv_hook(
            parse_cv_hook_request(
                {
                    "signal": _sample_signal(),
                    "acknowledgedCheckpoints": ["person_down_confirmed"],
                }
            )
        )
        self.assertFalse(second.requiresUserConfirmation)

    def test_person_down_classifier_marks_likely_for_lying_closed_eyes(self) -> None:
        response = evaluate_cv_hook(
            parse_cv_hook_request(
                {
                    "signal": _sample_signal(
                        bodyPosture="lying",
                        postureConfidence=0.88,
                        eyesClosedConfidence=0.72,
                        compressionRateBpm=108,
                        compressionRhythmQuality="good",
                    )
                }
            )
        )
        self.assertEqual(response.personDownHint.status, "likely")
        self.assertGreaterEqual(response.personDownHint.confidence, 0.6)

    def test_person_down_classifier_suppresses_upright_open_eye_cases(self) -> None:
        response = evaluate_cv_hook(
            parse_cv_hook_request(
                {
                    "signal": _sample_signal(
                        bodyPosture="upright",
                        postureConfidence=0.9,
                        eyesClosedConfidence=0.08,
                        handPlacementStatus="unknown",
                        placementConfidence=0.2,
                        compressionRateBpm=0,
                        compressionRhythmQuality="unknown",
                    )
                }
            )
        )
        self.assertEqual(response.personDownHint.status, "unclear")
        self.assertLess(response.personDownHint.confidence, 0.4)

    def test_parse_rejects_invalid_payload(self) -> None:
        with self.assertRaises(ValueError):
            parse_cv_hook_request({"signal": {"handPlacementStatus": "correct"}})

    def test_service_health_endpoint(self) -> None:
        status, body = self._request_json("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(body.get("status"), "ok")
        self.assertEqual(body.get("service"), "rescuesight-cv-stub")

    def test_service_evaluate_endpoint(self) -> None:
        status, body = self._request_json(
            "POST",
            "/api/cv/evaluate",
            {"signal": _sample_signal(handPlacementStatus="too_right")},
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["handPlacementHint"]["directive"], "move_left")
        self.assertIn("requiresUserConfirmation", body)

        invalid_status, invalid_body = self._request_json(
            "POST",
            "/api/cv/evaluate",
            {"signal": {"handPlacementStatus": "correct"}},
        )
        self.assertEqual(invalid_status, 400)
        self.assertIn("expected", invalid_body)

    def _request_json(
        self,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
    ) -> tuple[int, dict[str, object]]:
        data = None
        headers: dict[str, str] = {}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = url_request.Request(
            f"{self.base_url}{path}",
            data=data,
            headers=headers,
            method=method,
        )

        try:
            with url_request.urlopen(request, timeout=3) as response:
                raw = response.read().decode("utf-8")
                return response.status, json.loads(raw) if raw else {}
        except url_error.HTTPError as error:
            raw = error.read().decode("utf-8")
            status = error.code
            error.close()
            return status, json.loads(raw) if raw else {}


if __name__ == "__main__":
    unittest.main()
