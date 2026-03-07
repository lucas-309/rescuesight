from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

from .contracts import Incident
from .incident_schema import build_incident_schema, validate_incident_schema


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class SessionManager:
    def __init__(self) -> None:
        self._incidents: dict[str, Incident] = {}
        self._lock = Lock()

    def start_session(self, location: str | None = None) -> Incident:
        if location is not None and not isinstance(location, str):
            raise TypeError("location must be a string or None")

        incident = build_incident_schema(
            incident_id=str(uuid4()),
            start_time=_utc_now_iso(),
            location=location,
        )
        validate_incident_schema(incident)

        with self._lock:
            self._incidents[incident["incident_id"]] = deepcopy(incident)

        return deepcopy(incident)

    def get_session(self, incident_id: str) -> Incident | None:
        if not isinstance(incident_id, str) or not incident_id.strip():
            raise ValueError("incident_id must be a non-empty string")

        with self._lock:
            incident = self._incidents.get(incident_id)

        return deepcopy(incident) if incident is not None else None
