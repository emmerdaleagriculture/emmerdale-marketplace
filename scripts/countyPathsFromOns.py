#!/usr/bin/env python3
"""
Project ONS county/district outlines into src/lib/ukCountyPaths.ts space.

The original generator for that file was never committed. This one rebuilt the
Northern Ireland districts on 2026-10-10 using the spherical-Mercator fit
recovered in src/lib/radiusCoverage.ts (K, TX, TY), so new outlines land on
the same canvas as the existing ones without touching them.

Usage:
  curl -s -o buc.geojson "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/\
Counties_and_Unitary_Authorities_December_2023_Boundaries_UK_BUC/FeatureServer/0/query?\
where=CTYUA23CD%20like%20%27N%25%27&outFields=CTYUA23CD,CTYUA23NM&outSR=4326&f=geojson"
  python3 scripts/countyPathsFromOns.py buc.geojson > paths.json

Output is {name: "M…L…Z…"} keyed by the ONS name, which must match
counties.name exactly. Paste each entry into UK_COUNTY_PATHS and bump the
count in its header comment. Check the result renders before committing:
a bad fit shows up at once as an island floating in the wrong sea.
"""
import json, math, sys

K = 3952.9142195600643
TX = 435.8751170350811
TY = 4657.174485721973
DEG = math.pi / 180


def project(lat, lng):
    return (TX + K * lng * DEG, TY - K * math.log(math.tan(math.pi / 4 + lat * DEG / 2)))


def fmt(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def path_for(geometry):
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    d = ""
    for poly in polys:
        for ring in poly:
            pts = [project(lat, lng) for lng, lat in ring]
            if pts[0] == pts[-1]:
                pts = pts[:-1]
            seq = []
            for x, y in pts:
                p = (fmt(x), fmt(y))
                if not seq or seq[-1] != p:
                    seq.append(p)
            d += "M" + "L".join(f"{x},{y}" for x, y in seq) + "Z"
    return d


def main(path):
    g = json.load(open(path))
    out = {}
    for f in sorted(g["features"], key=lambda f: f["properties"]["CTYUA23NM"]):
        out[f["properties"]["CTYUA23NM"]] = path_for(f["geometry"])
    json.dump(out, sys.stdout, indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
