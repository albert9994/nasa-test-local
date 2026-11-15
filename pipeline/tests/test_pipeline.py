"""Tests for the Hotar data pipeline (real-data build; no network access needed)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from pipeline.build_packs import build_all_packs, build_single_pack
from pipeline.cmip6.nex_gddp import (
    BASELINE,
    HEADLINE,
    MODELS,
    annual_stats,
    build_scenarios,
    cell_center,
)
from pipeline.common import (
    FARMS_DIR,
    LAYERS_DIR,
    PUBLIC_DATA_DIR,
    REPO_ROOT,
    VALIDATION_DIR,
    atomic_write_json,
    load_farms,
)
from pipeline.generate_meta import build_meta
from pipeline.power.fetch_weather import clean_series, parse_power_response
from pipeline.terrain.fetch_terrain import horn_slope_pct

FARM_IDS = ("iowa", "kansas", "baragan", "vaslui", "dolj", "teleorman")


def test_clean_series_carries_forward_missing_999() -> None:
    raw = [-999.0, 12.34, -999.0, -999.0, 15.67, -999.0]
    assert clean_series(raw, decimals=1, default_val=20.0) == [12.3, 12.3, 12.3, 12.3, 15.7, 15.7]


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
    assert weather["2024"]["tmax"] == [1.2, 1.2]
    assert weather["2024"]["prcp"] == [0.0, 3.5]


def test_build_packs_tolerates_missing_layers_and_keeps_monthly(tmp_path: Path) -> None:
    layers_dir, farms_dir = tmp_path / "layers", tmp_path / "farms"
    layer = layers_dir / "testfarm"
    atomic_write_json(
        layer / "meta.json",
        {"id": "testfarm", "name": "Test", "nameRo": "Test", "country": "RO", "lat": 45.0, "lon": 25.0,
         "slope": 1.0, "rotation": ["maize", "wheat"], "note": "unit test"},
    )
    atomic_write_json(layer / "weather.json", {"2024": {"tmax": [20.0], "tmin": [10.0], "prcp": [1.0]}})
    scen = {"source": "x", "models": ["m"], "season": "Apr-Sep",
            "monthly": {"ssp245": {"2050": {"dT": [1.0] * 12, "dP": [0.0] * 12}}}}
    atomic_write_json(layer / "scenarios.json", scen)
    pack = build_single_pack("testfarm", layers_dir=layers_dir, farms_dir=farms_dir)
    assert pack is not None
    assert "soil" not in pack and "ndvi" not in pack
    assert pack["scenarios"]["monthly"]["ssp245"]["2050"]["dT"] == [1.0] * 12
    entries = build_all_packs(layers_dir=layers_dir, farms_dir=farms_dir, seed_mock=False)
    entry = next(e for e in entries if e["id"] == "testfarm")
    assert entry["nameRo"] == "Test" and entry["country"] == "RO"


def test_seed_mock_is_off_by_default(tmp_path: Path, monkeypatch) -> None:
    import pipeline.build_packs as bp

    calls: list[bool] = []
    monkeypatch.setattr(bp, "build_all_packs", lambda **kw: calls.append(kw["seed_mock"]) or [])
    assert bp.main(["--no-meta", "--layers-dir", str(tmp_path), "--farms-dir", str(tmp_path)]) == 0
    assert calls == [False]
    assert bp.main(["--no-meta", "--seed-mock", "--layers-dir", str(tmp_path), "--farms-dir", str(tmp_path)]) == 0
    assert calls == [False, True]


def test_cell_center_snaps_to_nex_grid() -> None:
    assert cell_center(42.03, -93.62) == (42.125, -93.625)
    assert cell_center(44.55, 27.45) == (44.625, 27.375)


def _fake_stats(dt: float, dp: float) -> dict:
    """Stats table where every model warms by `dt` and wets by `dp` (fraction) in the headline window."""
    stats: dict = {}
    cell = (44.625, 27.375)

    def year_stats(tmax: float, pr_total: float, var: str) -> dict:
        if var == "tasmax":
            return {"gs": tmax, "monthly": [tmax] * 12}
        return {"gs": pr_total, "monthly": [pr_total / 6] * 12}

    for model in MODELS:
        for var in ("tasmax", "pr"):
            hist = {y: year_stats(25.0, 300.0, var) for y in range(BASELINE[0], BASELINE[1] + 1)}
            stats[(cell, model, "historical", var)] = hist
            for ssp in ("ssp245", "ssp585"):
                fut = {}
                for y in range(2021, 2101):
                    in_head = HEADLINE[0] <= y <= HEADLINE[1]
                    fut[y] = year_stats(25.0 + (dt if in_head else 0.5), 300.0 * (1 + (dp if in_head else 0)), var)
                stats[(cell, model, ssp, var)] = fut
    return stats


def test_build_scenarios_math_and_c4_shape() -> None:
    scen = build_scenarios(_fake_stats(2.0, -0.05), {"lat": 44.55, "lon": 27.45})
    s = scen["ssp245"]["2050"]
    assert abs(s["dT"] - 2.0) < 0.01 and abs(s["dP"] + 0.05) < 0.001
    assert s["dT_p10"] <= s["dT"] <= s["dT_p90"]
    assert [p["year"] for p in scen["ssp245"]["series"]] == [2030, 2040, 2050, 2060, 2070, 2080, 2090]
    assert abs(scen["ssp245"]["series"][0]["dT"] - 0.5) < 0.01  # 2030 window is outside the headline
    assert len(scen["monthly"]["ssp585"]["2050"]["dT"]) == 12
    assert scen["models"] == MODELS and scen["season"] == "Apr-Sep"
    assert "NEX-GDDP-CMIP6" in scen["source"]


def test_annual_stats_precip_is_total_and_temp_is_mean() -> None:
    months = [m for m in range(1, 13) for _ in range(30)]
    t = annual_stats({"m": months, "v": [20.0] * 360}, "tasmax")
    p = annual_stats({"m": months, "v": [2.0] * 360}, "pr")
    assert t["gs"] == 20.0 and abs(p["gs"] - 360.0) < 1e-9  # 6 months x 30 d x 2 mm


def test_horn_slope_flat_and_tilted() -> None:
    flat = [[10.0] * 3 for _ in range(3)]
    assert horn_slope_pct(flat, 90.0, 90.0) == 0.0
    east_up = [[10.0, 19.0, 28.0]] * 3  # +18 m per 180 m = 10 %
    assert abs(horn_slope_pct(east_up, 90.0, 90.0) - 10.0) < 1e-6


def test_presets_cover_six_farms_with_bilingual_names() -> None:
    farms = {f["id"]: f for f in load_farms()}
    assert set(FARM_IDS) <= set(farms)
    for fid in FARM_IDS:
        assert farms[fid]["name"] and farms[fid]["nameRo"] and farms[fid]["country"]
        assert "illustrative" == farms[fid]["economics"]["status"]
    assert (farms["kansas"]["lat"], farms["kansas"]["lon"]) == (37.95, -100.85)
    assert "Ialomița" in farms["baragan"]["name"]
    meta = build_meta(farms["baragan"])
    assert meta["nameRo"] == farms["baragan"]["nameRo"]


def test_committed_packs_are_real_and_small() -> None:
    index = json.loads((FARMS_DIR / "index.json").read_text(encoding="utf-8"))
    assert [e["id"] for e in index][:3] == ["iowa", "kansas", "baragan"]
    assert {e["id"] for e in index} >= set(FARM_IDS)
    for fid in FARM_IDS:
        path = FARMS_DIR / f"{fid}.json"
        assert path.stat().st_size < 1_000_000
        pack = json.loads(path.read_text(encoding="utf-8"))
        assert len(pack["weather"]) == 25 and "soil" in pack
        assert "scenarios" in pack and "monthly" in pack["scenarios"]
        assert "smap" not in pack and "esi" not in pack
        s = pack["scenarios"]["ssp245"]["2050"]
        assert 0.5 < s["dT"] < 5.0 and -0.5 < s["dP"] < 0.5
        assert "NEX-GDDP-CMIP6" in pack["scenarios"]["source"]


def test_no_synthetic_layers_published() -> None:
    for fid in FARM_IDS:
        layer_dir = LAYERS_DIR / fid
        for banned in ("parcels.json", "appeears.json"):
            assert not (layer_dir / banned).exists()
    assert (PUBLIC_DATA_DIR / "catalog.json").exists()


def test_validation_files_have_provenance() -> None:
    for fid in FARM_IDS:
        data = json.loads((VALIDATION_DIR / f"{fid}.json").read_text(encoding="utf-8"))
        assert "verified" in data and data["crops"] and data["url"]
        if fid in ("baragan", "vaslui", "dolj", "teleorman"):
            assert data["verified"] is True and "TEMPO" in data["source"]
            assert len(data["crops"]["maize"]["years"]) >= 30
        for crop in data["crops"].values():
            vals = np.array(list(crop["years"].values()))
            assert vals.min() > 0 and vals.max() < 20


def test_catalog_lists_every_farm_and_status() -> None:
    cat = json.loads((PUBLIC_DATA_DIR / "catalog.json").read_text(encoding="utf-8"))
    for d in cat["datasets"]:
        assert d["status"] in ("real", "illustrative")
        assert {"id", "name", "nameRo", "provider", "url", "resolution", "period", "usedFor"} <= set(d)
    ids = {d["id"] for d in cat["datasets"]}
    for fid in FARM_IDS:
        assert set(cat["farms"][fid]["layers"]) <= ids | {"meta"}


def test_prompts_and_docs_exist() -> None:
    # the system prompts the server embeds (crates/hotar-server/src/advisor.rs)
    for fname in ("explain_short.md", "explain_plan.md", "chat.md", "judge.md", "score_adjust.md"):
        assert (REPO_ROOT / "prompts" / fname).exists()
    for doc in ("DATA_SOURCES.md", "SCIENCE.md", "CONTRACTS.md"):
        assert (REPO_ROOT / "docs" / doc).exists()
