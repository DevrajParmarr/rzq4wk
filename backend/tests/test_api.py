from __future__ import annotations


def test_health(client) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_meta_lists_delivery_dates_and_presets(client) -> None:
    body = client.get("/api/v1/meta").json()
    assert body["delivery_dates"] == ["2026-01-02", "2026-01-03", "2026-01-04"]
    assert {p["time"] for p in body["gate_presets"]} == {"09:20", "09:50"}
    assert body["default_gate"] == "09:20"


def test_day_ahead_contract(client) -> None:
    response = client.get("/api/v1/day-ahead", params={"delivery_date": "2026-01-03", "gate": "09:20"})
    assert response.status_code == 200
    body = response.json()
    assert body["decision_cutoff"] == "2026-01-02T09:20:00Z"
    assert body["forecast_publish_time"] == "2026-01-02T07:30:00Z"
    assert body["decision_day_publishes"] == [
        "2026-01-02T02:30:00Z",
        "2026-01-02T07:30:00Z",
        "2026-01-02T09:30:00Z",
        "2026-01-02T15:30:00Z",
    ]
    assert len(body["forecast_points"]) == 24
    assert len(body["actual_points"]) == 48
    assert body["summary"]["metrics"]["n"] == 24
    assert response.headers["cache-control"].startswith("public")


def test_day_ahead_defaults_gate(client) -> None:
    body = client.get("/api/v1/day-ahead", params={"delivery_date": "2026-01-03"}).json()
    assert body["gate"] == "09:20"


def test_invalid_gate_is_422(client) -> None:
    response = client.get("/api/v1/day-ahead", params={"delivery_date": "2026-01-03", "gate": "9am"})
    assert response.status_code == 422
    assert "HH:MM" in response.json()["detail"]


def test_out_of_scope_date_is_422(client) -> None:
    response = client.get("/api/v1/day-ahead", params={"delivery_date": "2026-03-01"})
    assert response.status_code == 422


def test_accuracy_contract(client) -> None:
    body = client.get("/api/v1/accuracy", params={"gate": "09:50"}).json()
    assert body["gate"] == "09:50"
    assert len(body["daily"]) == 3
    assert len(body["by_horizon"]) == 25
    assert body["metrics"]["n"] == 72


def test_series_validates_range(client) -> None:
    ok = client.get(
        "/api/v1/series", params={"start": "2026-01-02T00:00:00Z", "end": "2026-01-03T00:00:00Z", "horizon_h": 4}
    )
    assert ok.status_code == 200
    assert len(ok.json()["actual_points"]) == 48

    out_of_range = client.get("/api/v1/series", params={"start": "2027-01-01", "end": "2027-01-02"})
    assert out_of_range.status_code == 422

    bad_horizon = client.get("/api/v1/series", params={"start": "2026-01-02", "end": "2026-01-03", "horizon_h": 100})
    assert bad_horizon.status_code == 422
