"""
ETL do Painel de BI – Rendimento Agrícola Global (FAO / World Bank, 1990–2013).

Extract   : archive/*.csv
Transform : limpeza, deduplicação, enriquecimento geográfico (geopandas),
            modelagem dimensional (esquema estrela) e cálculo de KPIs/insights.
Load      : JSON compacto consumido pelo Angular via DTOs
            (dashboard/public/data/bi-dataset.json + world.geojson)

Uso: .venv/bin/python etl/build_dataset.py
"""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "archive"
GEO = ROOT / "etl" / "geo" / "ne_110m_admin_0_countries.geojson"
OUT_STAR = ROOT / "etl" / "output"
OUT_APP = ROOT / "dashboard" / "public" / "data"

# Ilhas ausentes no Natural Earth 110m – coordenadas (lat, lon) da capital
MANUAL_COORDS = {
    "Bahrain": ("BHR", "BH", "Asia", "Western Asia", 26.07, 50.55),
    "Mauritius": ("MUS", "MU", "Africa", "Eastern Africa", -20.35, 57.55),
}

CROP_META = {
    "Cassava": ("Mandioca", "Raízes e tubérculos"),
    "Maize": ("Milho", "Cereais"),
    "Plantains and others": ("Banana-da-terra", "Frutas amiláceas"),
    "Potatoes": ("Batata", "Raízes e tubérculos"),
    "Rice, paddy": ("Arroz", "Cereais"),
    "Sorghum": ("Sorgo", "Cereais"),
    "Soybeans": ("Soja", "Leguminosas"),
    "Sweet potatoes": ("Batata-doce", "Raízes e tubérculos"),
    "Wheat": ("Trigo", "Cereais"),
    "Yams": ("Inhame", "Raízes e tubérculos"),
}

CONTINENT_PT = {
    "Africa": "África",
    "Asia": "Ásia",
    "Europe": "Europa",
    "North America": "América do Norte",
    "South America": "América do Sul",
    "Oceania": "Oceania",
}


def extract() -> pd.DataFrame:
    return pd.read_csv(RAW / "yield_df.csv", index_col=0)


def transform(df: pd.DataFrame):
    # 1. Limpeza: o join original com temp.csv gerou várias linhas por
    #    país/cultura/ano (uma por estação meteorológica). Consolida pela média.
    df = (
        df.rename(
            columns={
                "Area": "country",
                "Item": "crop",
                "Year": "year",
                "hg/ha_yield": "yield_hg",
                "average_rain_fall_mm_per_year": "rain",
                "pesticides_tonnes": "pest",
                "avg_temp": "temp",
            }
        )
        .groupby(["country", "crop", "year"], as_index=False)
        .agg(yield_hg=("yield_hg", "mean"), rain=("rain", "mean"), pest=("pest", "mean"), temp=("temp", "mean"))
    )
    df["yield_t"] = df["yield_hg"] / 10_000  # hg/ha -> t/ha (unidade de leitura humana)

    # 2. Dimensão País enriquecida com geopandas (ISO3, continente, centróide)
    world = gpd.read_file(GEO)
    world = world.to_crs(4326)
    reps = world.geometry.representative_point()
    world["lat"], world["lon"] = reps.y, reps.x
    lookup = {}
    for _, r in world.iterrows():
        for col in ("NAME", "ADMIN", "NAME_LONG"):
            lookup.setdefault(r[col], r)

    countries = []
    for i, name in enumerate(sorted(df["country"].unique())):
        if name in lookup:
            r = lookup[name]
            iso3 = r["ISO_A3"] if r["ISO_A3"] != "-99" else r["ADM0_A3"]
            iso2 = r["ISO_A2_EH"]  # versão "EH" preenche os -99 (França, Noruega)
            countries.append(
                dict(id=i, name=name, iso3=iso3, iso2=iso2.lower(), geoName=r["NAME"], continent=CONTINENT_PT.get(r["CONTINENT"], r["CONTINENT"]),
                     region=r["SUBREGION"], lat=round(float(r["lat"]), 3), lon=round(float(r["lon"]), 3))
            )
        else:
            iso3, iso2, cont, sub, lat, lon = MANUAL_COORDS[name]
            countries.append(dict(id=i, name=name, iso3=iso3, iso2=iso2.lower(), geoName=None, continent=CONTINENT_PT[cont], region=sub, lat=lat, lon=lon))
    dim_country = pd.DataFrame(countries)

    dim_crop = pd.DataFrame(
        [dict(id=i, name=c, namePt=CROP_META[c][0], group=CROP_META[c][1]) for i, c in enumerate(sorted(df["crop"].unique()))]
    )
    years = sorted(df["year"].unique())
    dim_time = pd.DataFrame([dict(year=int(y), decade=f"{y // 10 * 10}s", period="1990–2001" if y <= 2001 else "2002–2013") for y in years])

    cid = dict(zip(dim_country.name, dim_country.id))
    kid = dict(zip(dim_crop.name, dim_crop.id))
    df["countryId"] = df["country"].map(cid)
    df["cropId"] = df["crop"].map(kid)

    # 3. Fatos: grão diferente → duas tabelas fato
    #    fato_producao : país × cultura × ano  (rendimento)
    #    fato_clima    : país × ano            (chuva, temperatura, pesticidas)
    fact_yield = df[["countryId", "cropId", "year", "yield_t"]].copy()
    fact_climate = df.groupby(["countryId", "year"], as_index=False).agg(rain=("rain", "mean"), temp=("temp", "mean"), pest=("pest", "mean"))

    return df, dim_country, dim_crop, dim_time, fact_yield, fact_climate


def cagr(first: float, last: float, n: int) -> float | None:
    if n <= 0 or first <= 0:
        return None
    return (last / first) ** (1 / n) - 1


def build_insights(df: pd.DataFrame, dim_country: pd.DataFrame, dim_crop: pd.DataFrame) -> dict:
    """KPIs e insights estáticos (visão global, sem filtros)."""
    pt = dict(zip(dim_crop.name, dim_crop.namePt))
    out: dict = {}

    # Correlação de Spearman (robusta a outliers/não-linearidade) por cultura
    corr = []
    for crop, g in df.groupby("crop"):
        row = {"crop": pt[crop]}
        for f in ("rain", "temp", "pest"):
            row[f] = round(float(g["yield_t"].rank().corr(g[f].rank())), 3)  # Spearman = Pearson dos ranks
        corr.append(row)
    out["correlations"] = corr

    # Crescimento por cultura (média global por ano, CAGR 1990→2013)
    growth = []
    for crop, g in df.groupby("crop"):
        s = g.groupby("year")["yield_t"].mean()
        first = s.loc[s.index.min():s.index.min() + 2].mean()
        last = s.loc[s.index.max() - 2:s.index.max()].mean()
        growth.append({"crop": pt[crop], "cagr": round(cagr(first, last, int(s.index.max() - s.index.min())) * 100, 2)})
    out["cropGrowth"] = sorted(growth, key=lambda x: -x["cagr"])

    # Yield gap: distância do país até o percentil 90 da cultura (último triênio)
    recent = df[df.year >= 2011]
    p90 = recent.groupby("crop")["yield_t"].quantile(0.9)
    gap = recent.groupby(["country", "crop"])["yield_t"].mean().reset_index()
    gap["gap"] = 1 - gap["yield_t"] / gap["crop"].map(p90)
    out["avgYieldGapPct"] = round(float(gap["gap"].clip(lower=0).mean() * 100), 1)

    # Narrativa
    top_growth = out["cropGrowth"][0]
    strongest = max(corr, key=lambda r: abs(r["pest"]))
    br = lambda v: str(v).replace(".", ",")
    out["narrative"] = [
        f"{top_growth['crop']} teve o maior crescimento anual composto de rendimento ({br(top_growth['cagr'])}% a.a.) entre 1990 e 2013.",
        f"Uso de pesticidas tem a correlação mais forte com o rendimento em {strongest['crop']} (ρ = {br(strongest['pest'])}).",
        f"Em média, os países operam {br(out['avgYieldGapPct'])}% abaixo do percentil 90 de rendimento da sua cultura (yield gap, 2011–2013).",
    ]
    return out


def load(df, dim_country, dim_crop, dim_time, fact_yield, fact_climate, insights):
    OUT_STAR.mkdir(parents=True, exist_ok=True)
    OUT_APP.mkdir(parents=True, exist_ok=True)

    # Esquema estrela em CSV (documentação / importação em outras ferramentas de BI)
    dim_country.to_csv(OUT_STAR / "dim_pais.csv", index=False)
    dim_crop.to_csv(OUT_STAR / "dim_cultura.csv", index=False)
    dim_time.to_csv(OUT_STAR / "dim_tempo.csv", index=False)
    fact_yield.to_csv(OUT_STAR / "fato_producao.csv", index=False)
    fact_climate.to_csv(OUT_STAR / "fato_clima.csv", index=False)

    # JSON compacto: fatos como arrays posicionais (schema descrito em "columns")
    payload = {
        "meta": {
            "source": "FAO (rendimento, pesticidas) e World Bank (chuva, temperatura)",
            "generatedAt": pd.Timestamp.now().isoformat(timespec="seconds"),
            "rawRows": int(extract().shape[0]),
            "cleanRows": int(df.shape[0]),
            "yearMin": int(dim_time.year.min()),
            "yearMax": int(dim_time.year.max()),
        },
        "dimCountry": dim_country.replace({np.nan: None}).to_dict(orient="records"),
        "dimCrop": dim_crop.to_dict(orient="records"),
        "dimTime": dim_time.to_dict(orient="records"),
        "factYield": {
            "columns": ["countryId", "cropId", "year", "yieldT"],
            "rows": [[int(a), int(b), int(c), round(float(d), 4)] for a, b, c, d in fact_yield.itertuples(index=False)],
        },
        "factClimate": {
            "columns": ["countryId", "year", "rain", "temp", "pest"],
            "rows": [[int(a), int(b), round(float(c), 1), round(float(d), 2), round(float(e), 2)] for a, b, c, d, e in fact_climate.itertuples(index=False)],
        },
        "insights": insights,
    }
    (OUT_APP / "bi-dataset.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))

    # GeoJSON simplificado só com o necessário para o mapa (nome = NAME do NE)
    world = gpd.read_file(GEO)[["NAME", "ISO_A3", "geometry"]].rename(columns={"NAME": "name"})
    world = world[world["name"] != "Antarctica"]
    (OUT_APP / "world.geojson").write_text(world.to_json(drop_id=True))


def main():
    raw = extract()
    df, dim_country, dim_crop, dim_time, fact_yield, fact_climate = transform(raw)
    insights = build_insights(df, dim_country, dim_crop)
    load(df, dim_country, dim_crop, dim_time, fact_yield, fact_climate, insights)
    print(f"raw={len(raw)} clean={len(df)} países={len(dim_country)} culturas={len(dim_crop)}")
    for line in insights["narrative"]:
        print(" -", line)
    print(pd.DataFrame(insights["correlations"]))


if __name__ == "__main__":
    main()
