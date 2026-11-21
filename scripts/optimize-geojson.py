#!/usr/bin/env python3
"""
Optimizes raw ciclomapa-df.geojson (~6.4 MB) into two compact, MapLibre-ready files:
  - public/data/ciclomapa-df-lanes.geojson (cycling corridors & prohibited highways)
  - public/data/ciclomapa-df-pois.geojson  (bike racks, repair shops & bike-share stations)

Strips unrelated municipal boundary polygons and rounds coordinates to 5 decimal places (~1.1m).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "ciclomapa-df.geojson"
OUT_DIR = ROOT / "public" / "data"

LANE_KIND_MAP = {
    "Ciclovia": "ciclovia",
    "Ciclofaixa": "ciclofaixa",
    "Baixa velocidade": "baixa_velocidade",
    "Calçada compartilhada": "calcada",
    "Trilha": "trilha",
    "Proibido": "proibido",
}

POI_KIND_MAP = {
    "Bicicletários & paraciclos": "paraciclo",
    "Lojas & oficinas": "oficina",
    "Estações": "estacao",
}


def round_coords(coords: Any, precision: int = 5) -> Any:
    if isinstance(coords, (int, float)):
        return round(coords, precision)
    if isinstance(coords, list):
        return [round_coords(c, precision) for c in coords]
    return coords


def polygon_centroid(coords: list[Any]) -> list[float] | None:
    ring = coords[0] if coords and isinstance(coords[0], list) else []
    if not ring:
        return None
    lngs = [pt[0] for pt in ring if isinstance(pt, list) and len(pt) >= 2]
    lats = [pt[1] for pt in ring if isinstance(pt, list) and len(pt) >= 2]
    if not lngs:
        return None
    return [round(sum(lngs) / len(lngs), 5), round(sum(lats) / len(lats), 5)]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with SRC.open(encoding="utf-8") as f:
        raw = json.load(f)

    lanes: list[dict[str, Any]] = []
    pois: list[dict[str, Any]] = []

    for feat in raw.get("features", []):
        props = feat.get("properties") or {}
        ftype = props.get("type")
        geom = feat.get("geometry") or {}
        gtype = geom.get("type")

        if ftype in LANE_KIND_MAP and gtype in ("LineString", "MultiLineString"):
            clean_props: dict[str, Any] = {
                "kind": LANE_KIND_MAP[ftype],
                "label": ftype,
            }
            if props.get("name"):
                clean_props["name"] = str(props["name"]).strip()
            lanes.append(
                {
                    "type": "Feature",
                    "properties": clean_props,
                    "geometry": {
                        "type": gtype,
                        "coordinates": round_coords(geom["coordinates"]),
                    },
                }
            )
        elif ftype in POI_KIND_MAP:
            pt_coords: list[float] | None = None
            if gtype == "Point":
                pt_coords = round_coords(geom["coordinates"][:2])
            elif gtype == "Polygon":
                pt_coords = polygon_centroid(geom["coordinates"])
            elif gtype == "MultiPolygon" and geom["coordinates"]:
                pt_coords = polygon_centroid(geom["coordinates"][0])

            if pt_coords:
                clean_props = {
                    "kind": POI_KIND_MAP[ftype],
                    "label": ftype,
                }
                if props.get("name"):
                    clean_props["name"] = str(props["name"]).strip()
                pois.append(
                    {
                        "type": "Feature",
                        "properties": clean_props,
                        "geometry": {
                            "type": "Point",
                            "coordinates": pt_coords,
                        },
                    }
                )

    lanes_path = OUT_DIR / "ciclomapa-df-lanes.geojson"
    pois_path = OUT_DIR / "ciclomapa-df-pois.geojson"

    with lanes_path.open("w", encoding="utf-8") as f:
        json.dump(
            {"type": "FeatureCollection", "features": lanes},
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    with pois_path.open("w", encoding="utf-8") as f:
        json.dump(
            {"type": "FeatureCollection", "features": pois},
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    orig_kb = SRC.stat().st_size / 1024
    lanes_kb = lanes_path.stat().st_size / 1024
    pois_kb = pois_path.stat().st_size / 1024
    print(f"Original: {orig_kb:.1f} KB")
    print(f"Lanes:    {lanes_kb:.1f} KB ({len(lanes)} features)")
    print(f"POIs:     {pois_kb:.1f} KB ({len(pois)} features)")
    print(f"Savings:  {100 * (1 - (lanes_kb + pois_kb) / orig_kb):.1f}%")


if __name__ == "__main__":
    main()
