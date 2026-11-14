"""Unit and contract tests for FieldShift data pipeline (LU0, LU1, LU3, LU5, LU7, LU8)."""

from __future__ import annotations

import json
from pathlib import Path

from pipeline.build_packs import build_all_packs, build_single_pack
from pipeline.cmip6.build_scenarios import build_scenarios_for_farm
from pipeline.cmip6.download_cmip6 import nearest_quarter_degree_cell
from pipeline.common import (
    FARMS_DIR,
    MOCK_DIR,
    REPO_ROOT,
    VALIDATION_DIR,
    atomic_write_json,
    load_farms,
)
from pipeline.power.fetch_weather import clean_series, parse_power_response


def test_clean_series_carries_forward_missing_999() -> None:
    raw = [-999.0, 12.34, -999.0, -999.0, 15.67, -999.0]
    cleaned = clean_series(raw, decimals=1, default_val=20.0)
    assert cleaned == [12.3, 12.3, 12.3, 12.3, 15.7, 15.7]


def test_parse_power_response_c1_shape() -> None:
    payload = {
        "geometry": {"coordinates": [-93.62, 42.03, 310.22]},
        "properties": {
            "parameter": {
                "T2M_MAX": {"20240101": 1.23, "20240102": -999.0},
                "T2M_MIN": {"20240101": -5.12, "20240102": -4.01},
                "PRECTOTCORR": {"20240101": 0.0, "20240102": 3.45},
                "GWETROOT": {"20240101": 0.456, "20240102": -999.0},
                "ALLSKY_SFC_SW_DWN": {"20240101": 8.11, "20240102": 9.22},
                "RH2M": {"20240101": 80.1, "20240102": 75.4},
                "WS2M": {"20240101": 3.21, "20240102": 4.12},
            }
        },
    }
    weather, elev = parse_power_response(payload, start_year=2024, end_year=2024)
    assert elev == 310.22
    assert "2024" in weather
    w24 = weather["2024"]
    assert w24["tmax"] == [1.2, 1.2]
    assert w24["gwet"] == [0.46, 0.46]
    assert w24["prcp"] == [0.0, 3.5]


def test_build_packs_tolerates_missing_layers_and_copies_appeears_slope(tmp_path: Path) -> None:
    layers_dir = tmp_path / "layers"
    farms_dir = tmp_path / "farms"
    farm_layer = layers_dir / "testfarm"

    atomic_write_json(
        farm_layer / "meta.json",
        {
            "id": "testfarm",
            "name": "Test Farm",
            "lat": 45.0,
            "lon": 25.0,
            "slope": 1.0,
            "rotation": ["maize", "wheat"],
            "note": "Unit test farm",
        },
    )
    atomic_write_json(
        farm_layer / "weather.json",
        {"2024": {"tmax": [20.0], "tmin": [10.0], "prcp": [1.0]}},
    )
    atomic_write_json(
        farm_layer / "appeears.json",
        {"slope": 3.4, "smap": {"2024": [[1, 0.32]]}},
    )

    # Deliberately omit soil.json, ndvi.json, scenarios.json
    pack = build_single_pack("testfarm", layers_dir=layers_dir, farms_dir=farms_dir)
    assert pack is not None
    assert "weather" in pack
    assert "soil" not in pack
    assert "ndvi" not in pack
    assert "scenarios" not in pack
    assert pack["meta"]["slope"] == 3.4
    assert pack["smap"] == {"2024": [[1, 0.32]]}

    entries = build_all_packs(layers_dir=layers_dir, farms_dir=farms_dir, seed_mock=False)
    assert any(e["id"] == "testfarm" and e["slope"] == 3.4 for e in entries)


def test_cmip6_scenarios_c4_contract_and_sanity() -> None:
    for farm in load_farms():
        scen = build_scenarios_for_farm(farm)
        assert "models" in scen and len(scen["models"]) >= 6
        assert scen["season"] == "Apr-Sep"
        for ssp in ("ssp245", "ssp585"):
            s2050 = scen[ssp]["2050"]
            assert 1.5 <= s2050["dT"] <= 3.5
            assert s2050["dT_p10"] <= s2050["dT"] <= s2050["dT_p90"]
            assert s2050["dP_p10"] <= s2050["dP"] <= s2050["dP_p90"]
            years = [pt["year"] for pt in scen[ssp]["series"]]
            assert years == [2030, 2040, 2050, 2060, 2070, 2080, 2090]


def test_nearest_quarter_degree_cell() -> None:
    lat, lon = nearest_quarter_degree_cell(42.03, -93.62)
    assert lat == 42.125
    assert lon == -93.625


def test_committed_mocks_and_farm_packs_exist_and_match_contracts() -> None:
    assert (MOCK_DIR / "tiny_pack.json").exists()
    assert (MOCK_DIR / "scenarios.json").exists()
    assert (MOCK_DIR / "summary.json").exists()
    assert (VALIDATION_DIR / "summary.json").exists()
    assert (FARMS_DIR / "index.json").exists()

    with open(MOCK_DIR / "tiny_pack.json", encoding="utf-8") as handle:
        tiny = json.load(handle)
    assert len(tiny["weather"]) == 2
    assert "meta" in tiny and "soil" in tiny and "scenarios" in tiny

    for farm_id in ("iowa", "kansas", "baragan"):
        pack_path = FARMS_DIR / f"{farm_id}.json"
        assert pack_path.exists()
        with open(pack_path, encoding="utf-8") as handle:
            pack = json.load(handle)
        assert pack["meta"]["id"] == farm_id
        assert len(pack["weather"]) == 25
        assert "soil" in pack
        assert "ndvi" in pack
        assert "scenarios" in pack


def test_prompts_and_story_docs_exist_and_follow_c10() -> None:
    prompts_dir = REPO_ROOT / "prompts"
    for fname in (
        "explain_short.md",
        "explain_plan.md",
        "chat.md",
        "fallback_short.md",
        "fallback_plan.md",
        "samples.json",
    ):
        assert (prompts_dir / fname).exists(), f"Missing prompt file: {fname}"

    with open(prompts_dir / "samples.json", encoding="utf-8") as handle:
        samples = json.load(handle)
    assert len(samples) >= 3
    for item in samples:
        assert "factSheet" in item
        assert "expected_en" in item
        assert "not a guarantee" in item["expected_en"].lower()

    for doc_name in ("STORY.md", "DATA_SOURCES.md", "DECK.md"):
        assert (REPO_ROOT / "docs" / doc_name).exists(), f"Missing doc: {doc_name}"

