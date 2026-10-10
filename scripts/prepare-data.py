#!/usr/bin/env python3
"""Freeze the public data sources used by PARTICLE ATLAS into offline assets.

This script deliberately keeps every downloaded source under ../data/raw and writes a
manifest with SHA-256 digests.  It has no runtime role in the website.
"""
from __future__ import annotations
import csv, hashlib, json, math, os, shutil, ssl, sys, time
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.error import URLError
from urllib.request import ProxyHandler, Request, build_opener

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAW = DATA / "raw"
SNAPSHOT = "2026-10-10"
UA = "PARTICLE-ATLAS-data-freeze/1.0 (offline exhibit build)"
SOURCES = {
    "penguins.csv": "https://raw.githubusercontent.com/allisonhorst/palmerpenguins/main/inst/extdata/penguins.csv",
    "population.json": "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&date=2025&per_page=20000",
    "countries.json": "https://api.worldbank.org/v2/country?format=json&per_page=400",
    "gistemp.csv": "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv",
    "earthquakes.geojson": "https://earthquake.usgs.gov/fdsnws/event/1/query.geojson?format=geojson&starttime=2026-09-01&endtime=2026-10-01&minmagnitude=4.5&eventtype=earthquake&orderby=time-asc",
    "land.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson",
    "coastline.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_coastline.geojson",
}

def fetch(url: str, path: Path) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        b = path.read_bytes()
        return {"url": url, "path": str(path.relative_to(DATA)).replace('\\\\','/'), "sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "downloaded": False}
    req = Request(url, headers={"User-Agent": UA})
    try:
        b = build_opener().open(req, timeout=8).read()
    except (URLError, TimeoutError):
        # This proxy is intentionally per-request; no process/global settings change.
        b = build_opener(ProxyHandler({"http": "http://127.0.0.1:7890", "https": "http://127.0.0.1:7890"})).open(req, timeout=30).read()
    path.write_bytes(b)
    return {"url": url, "path": str(path.relative_to(DATA)).replace('\\\\','/'), "sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "downloaded": True}

def load_json(name): return json.loads((RAW / name).read_text(encoding="utf-8"))

def valid_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None

def penguins():
    rows = list(csv.DictReader((RAW / "penguins.csv").open(encoding="utf-8-sig", newline="")))
    out=[]
    for i,r in enumerate(rows, 1):
        f, m = valid_float(r.get("flipper_length_mm")), valid_float(r.get("body_mass_g"))
        if f is not None and m is not None:
            out.append({"id": i, "species": r["species"].replace(" ", "_"), "flipper_mm": f, "mass_g": m})
    assert len(rows)==344 and len(out)==342, (len(rows),len(out))
    return out, {"rawRows":len(rows),"validRows":len(out),"rule":"non-null flipper_length_mm and body_mass_g"}

ZH = {"India":"印度","China":"中国","United States":"美国","Indonesia":"印度尼西亚","Pakistan":"巴基斯坦","Nigeria":"尼日利亚","Brazil":"巴西","Bangladesh":"孟加拉国"}
def population():
    meta={x["id"]:x for x in load_json("countries.json")[1]}
    rows=[]
    for x in load_json("population.json")[1]:
        code=x["countryiso3code"]
        # World Bank uses region.id == NA for aggregates; exclude them before sorting.
        if code and x["value"] is not None and meta.get(code,{}).get("region",{}).get("id") != "NA":
            rows.append({"code":code,"country":x["country"]["value"],"value":int(x["value"])})
    rows.sort(key=lambda r:r["value"], reverse=True)
    top=rows[:8]
    for r in top: r["name_zh"] = ZH.get(r["country"], r["country"])
    required=["India","China","United States","Indonesia","Pakistan","Nigeria","Brazil","Bangladesh"]
    assert [x["country"] for x in top] == required, top
    return top, {"year":2025,"eligibleEconomies":len(rows),"aggregateRule":"country metadata region.id != NA"}

def temperature():
    # NASA CSV carries human-readable headers above the actual table.
    lines=(RAW/"gistemp.csv").read_text(encoding="utf-8-sig").splitlines()
    start=next(i for i,x in enumerate(lines) if x.strip().startswith("Year,"))
    parsed=list(csv.DictReader(lines[start:]))
    out=[]
    for r in parsed:
        y=int(r["Year"])
        if 1880<=y<=2025 and r.get("J-D") not in (None,"***",""):
            # GISTEMP v4 CSV already reports J-D in degrees Celsius (for example
            # 2025 is 1.18), unlike older fixed-width hundredths tables.
            out.append({"year":y,"anomaly":float(r["J-D"])})
    assert len(out)==146 and out[0]["year"]==1880 and out[-1]["year"]==2025
    return out, {"column":"J-D","units":"degC","baseline":"1951-1980","range":"1880-2025"}

def earthquakes():
    features=load_json("earthquakes.geojson")["features"]
    out=[]
    for f in features:
        p=f["properties"]; c=f["geometry"]["coordinates"]
        if p.get("mag") is None: continue
        out.append({"id":f["id"],"lat":c[1],"lon":c[0],"depth_km":c[2],"mag":p["mag"],"place":p.get("place") or "", "time_ms":p["time"]})
    # Assert the server did honour the fixed selection rather than trusting a title.
    lower=int(datetime(2026,9,1,tzinfo=timezone.utc).timestamp()*1000); upper=int(datetime(2026,10,1,tzinfo=timezone.utc).timestamp()*1000)
    assert all(lower<=x["time_ms"]<upper and x["mag"]>=4.5 for x in out)
    return out, {"startUtc":"2026-09-01T00:00:00Z","endUtc":"2026-10-01T00:00:00Z","minMagnitude":4.5,"eventType":"earthquake"}

def ring_contains(ring, x, y):
    inside=False
    for (x1,y1),(x2,y2) in zip(ring, ring[1:]+ring[:1]):
        if (y1>y)!=(y2>y) and x < (x2-x1)*(y-y1)/(y2-y1+1e-30)+x1: inside=not inside
    return inside
def polygons(geo):
    out=[]
    for f in geo["features"]:
        g=f["geometry"]; sets=[g["coordinates"]] if g["type"]=="Polygon" else g["coordinates"]
        out.extend(sets)
    return out
def earth_land():
    ps=[]
    for poly in polygons(load_json("land.geojson")):
        xs=[p[0] for p in poly[0]]; ys=[p[1] for p in poly[0]]
        ps.append((min(xs),min(ys),max(xs),max(ys),poly))
    # Regular, deterministic equal-angle candidates; points are retained only when
    # inside real Natural Earth land polygons, then evenly thinned to exactly 8000.
    candidates=[]
    for lat in np.arange(-89.25,90,0.5):
        for lon in np.arange(-179.75,180,0.5):
            if any(x0<=lon<=x1 and y0<=lat<=y1 and ring_contains(poly[0],lon,float(lat)) and not any(ring_contains(h,lon,float(lat)) for h in poly[1:]) for x0,y0,x1,y1,poly in ps):
                candidates.append((round(float(lat),2),round(float(lon),2)))
    if len(candidates)<8000: raise RuntimeError(f"Natural Earth land grid only yielded {len(candidates)}")
    idx=np.linspace(0,len(candidates)-1,8000,dtype=int)
    flat=[]
    for i in idx: flat.extend(candidates[int(i)])
    coast=[]
    for f in load_json("coastline.geojson")["features"]:
        c=f["geometry"]["coordinates"]
        # retain vertices at 110m source resolution; lon,lat pairs for SVG/WebGL.
        coast.append([v for xy in c for v in (round(xy[0],4),round(xy[1],4))])
    return flat, coast, {"landPointCount":8000,"method":"0.5 degree deterministic grid inside Natural Earth 110m land polygons, evenly thinned"}

def tile_xy(lon, lat, z):
    n=2**z; x=(lon+180)/360*n; y=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
    return x,y
def local_wgs84_extents(lon0, lat0, lon1, lat1):
    """Ground distances on the WGS84 tangent plane at the dataset centre.

    Web Mercator coordinates are convenient for addressing tiles but its metres
    are enlarged by sec(latitude), so they must not drive vertical exaggeration.
    """
    a=6378137.0; e2=6.6943799901413165e-3; phi=math.radians((lat0+lat1)/2)
    denom=math.sqrt(1-e2*math.sin(phi)**2)
    n=a/denom
    m=a*(1-e2)/(denom**3)
    east=abs(math.radians(lon1-lon0)*n*math.cos(phi))
    north=abs(math.radians(lat1-lat0)*m)
    return east,north
def read_dem():
    z=12; xs=range(3624,3629); ys=range(1615,1620)
    tiles=[]; manifest=[]
    for y in ys:
        row=[]
        for x in xs:
            name=f"gsi-dem_png-z{z}-x{x}-y{y}.png"; url=f"https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png"
            manifest.append(fetch(url, RAW/name)); a=np.asarray(Image.open(RAW/name).convert("RGB"),dtype=np.int64)
            h=a[:,:,0]*65536+a[:,:,1]*256+a[:,:,2]; h=np.where(h==8388608,np.nan,h/100.0)
            row.append(h)
        tiles.append(np.concatenate(row,axis=1))
    raw=np.concatenate(tiles,axis=0)
    # Crop by exact Web-Mercator bbox then bilinear sample only valid data. The
    # selected GSI tile range is retained verbatim as mandated by the build brief.
    lon0,lat0,lon1,lat1=138.56,35.22,138.90,35.50
    gx0,gy0=tile_xy(lon0,lat0,z); gx1,gy1=tile_xy(lon1,lat1,z)
    # convert global pixel coordinate to selected mosaic coordinates
    px0=(gx0-3624)*256; px1=(gx1-3624)*256; py0=(gy0-1615)*256; py1=(gy1-1615)*256
    grid_size=256
    xi=np.linspace(px0,px1,grid_size); yi=np.linspace(py1,py0,grid_size) # north first
    xx,yy=np.meshgrid(xi,yi); x0=np.floor(xx).astype(int); y0=np.floor(yy).astype(int); fx=xx-x0; fy=yy-y0
    x0=np.clip(x0,0,raw.shape[1]-2); y0=np.clip(y0,0,raw.shape[0]-2)
    a,b,c,d=raw[y0,x0],raw[y0,x0+1],raw[y0+1,x0],raw[y0+1,x0+1]
    weights=np.stack([(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy]); vals=np.stack([a,b,c,d])
    valid=np.isfinite(vals); denom=(weights*valid).sum(axis=0); elev=np.nansum(vals*weights,axis=0)/denom
    if not np.all(np.isfinite(elev)): raise RuntimeError("DEM crop contains unresolvable no-data pixels")
    # Horizontal physical extent from a local WGS84 tangent plane, not Web
    # Mercator tile metres. This makes y=(h-base)/horiz*2 a real ×2 exaggeration.
    ex,ez=local_wgs84_extents(lon0,lat0,lon1,lat1); horiz=max(ex,ez)
    base=float(np.nanmin(elev)); high=float(np.nanmax(elev));
    xv=np.linspace(-ex/2,ex/2,grid_size); zv=np.linspace(ez/2,-ez/2,grid_size)
    pos=[]
    for j,zv0 in enumerate(zv):
        for i,xv0 in enumerate(xv): pos.extend([float(xv0/horiz),float((elev[j,i]-base)/horiz*2),float(zv0/horiz)])
    contours=marching(elev, base, high, ex, ez, horiz)
    source_res=2*math.pi*6378137*math.cos(math.radians((lat0+lat1)/2))/(256*(2**z))
    terrain={"width":grid_size,"height":grid_size,"elevations_m":[round(float(v),3) for v in elev.ravel()],"positions":[round(v,7) for v in pos],"bounds":[lon0,lat0,lon1,lat1],"min_m":round(base,3),"max_m":round(high,3),"base_m":round(base,3),"horizontalExtent_m":round(horiz,3),"verticalExaggeration":2,"sourceResolution_m":round(source_res,3),"displaySampleSpacing_m":round(horiz/(grid_size-1),3),"projection":"WGS84 local tangent plane at bbox centre; east=N(phi0)*cos(phi0)*delta_lon, north=M(phi0)*delta_lat","contours":contours}
    return terrain, manifest

def marching(grid, base, high, ex, ez, horiz):
    # Marching squares segments (normalised XYZ) at genuine 250 m elevation levels.
    H,W=grid.shape; levels=np.arange(math.ceil(base/250)*250, high, 250); lines=[]
    edges=[(0,1),(1,2),(2,3),(3,0)]
    for level in levels:
        seg=[]
        for j in range(H-1):
            for i in range(W-1):
                vs=[grid[j,i],grid[j,i+1],grid[j+1,i+1],grid[j+1,i]]; pts=[]
                for a,b in edges:
                    if (vs[a]<level)!=(vs[b]<level):
                        t=(level-vs[a])/(vs[b]-vs[a]); pa=[(i,j),(i+1,j),(i+1,j+1),(i,j+1)][a]; pb=[(i,j),(i+1,j),(i+1,j+1),(i,j+1)][b]
                        pts.append((pa[0]+t*(pb[0]-pa[0]),pa[1]+t*(pb[1]-pa[1])))
                if len(pts)==2:
                    line=[]
                    for x,y in pts:
                        line.extend([x/(W-1)*ex/horiz-.5*ex/horiz,(level-base)/horiz*2,.5*ez/horiz-y/(H-1)*ez/horiz])
                    seg.append(line)
        # independent segments are intentional; renderer can draw LinesSegments.
        if seg: lines.append([round(q,7) for s in seg for q in s])
    return lines

def main():
    RAW.mkdir(parents=True,exist_ok=True)
    audit={"snapshotDate":SNAPSHOT,"generatedAtUtc":datetime.now(timezone.utc).isoformat(),"sources":[]}
    for name,url in SOURCES.items(): audit["sources"].append(fetch(url,RAW/name))
    p,pa=penguins(); pop,po=population(); temp,ta=temperature(); eq,ea=earthquakes(); land,coast,la=earth_land(); terr,dem=read_dem(); audit["sources"].extend(dem)
    obj={"metadata":{"snapshotDate":SNAPSHOT,"populationYear":2025,"temperatureEndYear":2025,"penguinRawCount":344,"penguinValidCount":342,"earthquakeCount":len(eq),"earthquakeSelection":ea,"temperature":ta,"population":po,"penguins":pa,"earthLand":la,"terrainSource":"GSI dem_png z12 x3624..3628 y1615..1619; RGB 24-bit signed centimetres; no-data 0x800000"},"penguins":p,"population":pop,"temperature":temp,"earthquakes":eq,"terrain":terr,"earthLand":land,"coastlines":coast}
    (DATA/"processed.json").write_text(json.dumps(obj,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    (DATA/"atlas-data.js").write_text("window.ATLAS_DATA="+json.dumps(obj,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf-8")
    audit["cleaning"]={"penguins":pa,"population":po,"temperature":ta,"earthquakes":ea,"terrain":{"bbox":terr["bounds"],"grid":f"{terr['width']}x{terr['height']}","noData":"weighted interpolation from valid GSI neighbours; errors if unresolved","contourInterval_m":250,"projection":terr["projection"],"sourceResolution_m":terr["sourceResolution_m"],"displaySampleSpacing_m":terr["displaySampleSpacing_m"]}}
    (DATA/"manifest.json").write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"out":str(DATA),"penguins":len(p),"population":len(pop),"temperature":len(temp),"earthquakes":len(eq),"terrain":f"{terr['width']}x{terr['height']}","elevation":[terr['min_m'],terr['max_m']],"landPoints":len(land)//2,"coastlineLines":len(coast)},ensure_ascii=False))
if __name__=="__main__": main()
