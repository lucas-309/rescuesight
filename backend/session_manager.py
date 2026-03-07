from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

from .contracts import Incident


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class SessionManager:
    def __init__(self) -> None:
        self._incidents: dict[str, Incident] = {}
        self._lock = Lock()

    def start_session(self, location: str | None = None) -> Incident:
        incident: Incident = {
            "incident_id": str(uuid4()),
            "start_time": _utc_now_iso(),
            "location": location.strip() if isinstance(location, str) and location.strip() else None,
            "current_state": "SESSION_START",
            "responsiveness_status": None,
            "breathing_status": None,
            "cpr_active": False,
            "cpr_started_time": None,
            "rhythm_status": None,
            "hand_position_status": None,
            "transcript": [],
            "timeline": [],
            "incident_summary": None,
        }

        with self._lock:
            self._incidents[incident["incident_id"]] = incident

        return incident

    def get_session(self, incident_id: str) -> Incident | None:
        with self._lock:
            return self._incidents.get(incident_id)
