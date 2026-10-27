/**
 * DTOs do painel.
 *
 * Camada 1 – *Raw DTOs*: espelham o JSON gerado pelo ETL (esquema estrela).
 * Camada 2 – *Fact DTOs hidratados*: fatos já relacionados às dimensões.
 * Camada 3 – *View DTOs*: agregações prontas para cada visual.
 *
 *            dim_tempo (year)
 *                  │ 1
 *                  │ N
 * dim_pais ─1───N─ fato_producao ─N───1─ dim_cultura
 *    │ 1                 (país × cultura × ano)
 *    │ N
 * fato_clima (país × ano)  ── relacionada a fato_producao por (countryId, year)
 */

// ───────────── Camada 1 · Raw (contrato com o ETL) ─────────────
export interface CountryDimDto {
  id: number;
  name: string;
  iso3: string;
  /** ISO 3166-1 alfa-2 em minúsculas – usado pelas bandeiras (flag-icons). */
  iso2: string;
  /** Nome do polígono no GeoJSON; null quando o país não tem geometria (ilhas pequenas). */
  geoName: string | null;
  continent: string;
  region: string;
  lat: number;
  lon: number;
}

export interface CropDimDto {
  id: number;
  name: string;
  namePt: string;
  group: string;
}

export interface TimeDimDto {
  year: number;
  decade: string;
  period: string;
}

export interface ColumnarDto<T extends string> {
  columns: T[];
  rows: number[][];
}

export interface CorrelationDto {
  crop: string;
  rain: number;
  temp: number;
  pest: number;
}

export interface BiDatasetDto {
  meta: {
    source: string;
    generatedAt: string;
    rawRows: number;
    cleanRows: number;
    yearMin: number;
    yearMax: number;
  };
  dimCountry: CountryDimDto[];
  dimCrop: CropDimDto[];
  dimTime: TimeDimDto[];
  factYield: ColumnarDto<'countryId' | 'cropId' | 'year' | 'yieldT'>;
  factClimate: ColumnarDto<'countryId' | 'year' | 'rain' | 'temp' | 'pest'>;
  insights: {
    correlations: CorrelationDto[];
    cropGrowth: { crop: string; cagr: number }[];
    avgYieldGapPct: number;
    narrative: string[];
  };
}

// ───────────── Camada 2 · Fatos hidratados ─────────────
export interface ClimateFact {
  rain: number;
  temp: number;
  pest: number;
}

export interface YieldFact {
  country: CountryDimDto;
  crop: CropDimDto;
  year: number;
  /** Rendimento em toneladas por hectare. */
  yieldT: number;
  /** Índice relativo: 100 = média global da cultura no mesmo ano. Permite somar/comparar culturas diferentes. */
  index: number;
  climate: ClimateFact | null;
}

// ───────────── Camada 3 · View DTOs ─────────────
export type Metric = 'yieldT' | 'index';
export type Factor = 'rain' | 'temp' | 'pest';

/** Faixa de desempenho do país frente à média mundial (índice ≥ 110 / entre / ≤ 90). */
export type Tier = 'above' | 'avg' | 'below';

export interface FilterState {
  cropId: number | null;
  continent: string | null;
  countryId: number | null;
  tier: Tier | null;
  yearFrom: number;
  yearTo: number;
}

export interface KpiDto {
  id: string;
  label: string;
  value: number | null;
  format: 'number' | 'percent' | 'integer';
  unit?: string;
  decimals?: number;
  /** Variação vs. início do período (fração). */
  delta?: number | null;
  /** true quando o aumento é bom (verde); false quando é ruim; null neutro. */
  higherIsBetter?: boolean | null;
  spark?: number[];
  hint: string;
}

export interface CountryAggDto {
  country: CountryDimDto;
  value: number;
  yieldT: number | null;
  index: number;
  rank: number;
  cagr: number | null;
  cv: number;
  rain: number | null;
  temp: number | null;
  pest: number | null;
  crops: number;
  observations: number;
}

export interface CountryProfileDto extends CountryAggDto {
  totalCountries: number;
  trend: { year: number; value: number }[];
  topCrops: { crop: string; yieldT: number; index: number }[];
}

/** Líder de rendimento de uma cultura no recorte (legenda do mapa). */
export interface CropLeaderDto {
  crop: CropDimDto;
  country: CountryDimDto;
  yieldT: number;
  /** Quantas vezes o líder rende acima da média dos países que plantam a cultura. */
  timesAvg: number;
  runnerUp: { country: CountryDimDto; yieldT: number } | null;
  countries: number;
}

/** Linha da tabela em modo drill-down (um país, uma linha por cultura). */
export interface CountryCropDetailDto {
  crop: CropDimDto;
  yieldT: number;
  index: number;
  cagr: number | null;
  cv: number;
  /** Posição do país entre todos os que plantam a cultura no recorte. */
  rank: number;
  countries: number;
}

export interface TrendSeriesDto {
  name: string;
  points: [number, number][];
  band?: { year: number; p25: number; p50: number; p75: number }[];
}
