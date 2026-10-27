import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  BiDatasetDto,
  ClimateFact,
  CountryAggDto,
  CountryDimDto,
  CountryCropDetailDto,
  CountryProfileDto,
  CropDimDto,
  CropLeaderDto,
  FilterState,
  KpiDto,
  Metric,
  Tier,
  TrendSeriesDto,
  YieldFact,
} from '../models/dto';
import { cagr, groupBy, mean, quantile, std } from '../utils/stats';

/**
 * Camada semântica do painel: carrega o esquema estrela, resolve os
 * relacionamentos (fatos → dimensões) e expõe medidas como signals
 * recalculados a cada mudança de filtro (slice & dice).
 *
 * Filtragem cruzada: todo clique em um visual vira filtro global (toggle*).
 * - Visuais comparativos (mapa, ranking, rosca, legenda) usam o *contexto*:
 *   mostram todos os países e destacam o selecionado, para permitir trocar a seleção.
 * - Visuais analíticos (KPIs, evolução, variação, potencial) usam o *escopo*:
 *   ficam restritos ao país / faixa selecionados.
 */
@Injectable({ providedIn: 'root' })
export class BiDataService {
  private readonly http = inject(HttpClient);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly raw = signal<BiDatasetDto | null>(null);
  readonly facts = signal<YieldFact[]>([]);
  readonly countries = signal<CountryDimDto[]>([]);
  readonly crops = signal<CropDimDto[]>([]);

  /** País com o modal de perfil aberto (botão "Ver perfil" do filtro ativo). */
  readonly focusCountry = signal<number | null>(null);

  readonly filters = signal<FilterState>({ cropId: null, continent: null, countryId: null, tier: null, yearFrom: 1990, yearTo: 2013 });

  readonly years = computed(() => this.raw()?.dimTime.map((t) => t.year) ?? []);
  readonly continents = computed(() => [...new Set(this.countries().map((c) => c.continent))].sort());
  readonly selectedCrop = computed(() => this.crops().find((c) => c.id === this.filters().cropId) ?? null);
  readonly selectedCountry = computed(() => this.countries().find((c) => c.id === this.filters().countryId) ?? null);
  /** Países disponíveis no seletor (restritos ao continente filtrado). */
  readonly countryOptions = computed(() => {
    const cont = this.filters().continent;
    return this.countries().filter((c) => !cont || c.continent === cont).sort((a, b) => a.name.localeCompare(b.name));
  });
  readonly isFullPeriod = computed(() => {
    const m = this.raw()?.meta;
    return !m || (this.filters().yearFrom === m.yearMin && this.filters().yearTo === m.yearMax);
  });
  readonly hasFilters = computed(() => {
    const f = this.filters();
    return f.cropId != null || f.continent != null || f.countryId != null || f.tier != null || !this.isFullPeriod();
  });

  /** Uma cultura → t/ha é comparável. Várias culturas → só o índice relativo é aditivo. */
  readonly metric = computed<Metric>(() => (this.filters().cropId == null ? 'index' : 'yieldT'));
  readonly metricLabel = computed(() => (this.metric() === 'yieldT' ? 'Rendimento (t/ha)' : 'Índice de rendimento (100 = média mundial)'));
  readonly metricUnit = computed(() => (this.metric() === 'yieldT' ? 't/ha' : 'pts'));

  // ─────────── Carga + hidratação dos relacionamentos ───────────
  async load(): Promise<void> {
    try {
      const ds = await firstValueFrom(this.http.get<BiDatasetDto>('data/bi-dataset.json'));
      const countryById = new Map(ds.dimCountry.map((c) => [c.id, c]));
      const cropById = new Map(ds.dimCrop.map((c) => [c.id, c]));
      const climateByKey = new Map<string, ClimateFact>(
        ds.factClimate.rows.map(([cid, year, rain, temp, pest]) => [`${cid}|${year}`, { rain, temp, pest }]),
      );

      // Média mundial por cultura×ano → base do índice relativo
      const sums = new Map<string, [number, number]>();
      for (const [, cropId, year, y] of ds.factYield.rows) {
        const k = `${cropId}|${year}`;
        const s = sums.get(k) ?? [0, 0];
        s[0] += y; s[1]++;
        sums.set(k, s);
      }

      const facts: YieldFact[] = ds.factYield.rows.map(([countryId, cropId, year, yieldT]) => {
        const [s, n] = sums.get(`${cropId}|${year}`)!;
        return {
          country: countryById.get(countryId)!,
          crop: cropById.get(cropId)!,
          year,
          yieldT,
          index: (yieldT / (s / n)) * 100,
          climate: climateByKey.get(`${countryId}|${year}`) ?? null,
        };
      });

      this.raw.set(ds);
      this.countries.set(ds.dimCountry);
      this.crops.set([...ds.dimCrop].sort((a, b) => a.namePt.localeCompare(b.namePt)));
      this.filters.update((f) => ({ ...f, yearFrom: ds.meta.yearMin, yearTo: ds.meta.yearMax }));
      this.facts.set(facts);
    } catch (e) {
      this.error.set('Não foi possível carregar data/bi-dataset.json. Rode o ETL (etl/build_dataset.py).');
      console.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  setFilter(patch: Partial<FilterState>): void {
    this.filters.update((f) => {
      const next = { ...f, ...patch };
      if (next.yearFrom > next.yearTo) [next.yearFrom, next.yearTo] = [next.yearTo, next.yearFrom];
      // País fora do continente escolhido deixa de fazer sentido
      if (patch.continent !== undefined && next.countryId != null && next.continent != null) {
        const c = this.countries().find((x) => x.id === next.countryId);
        if (c && c.continent !== next.continent) next.countryId = null;
      }
      // Escolher um país de outro continente remove o filtro de continente
      if (patch.countryId != null && next.continent != null) {
        const c = this.countries().find((x) => x.id === patch.countryId);
        if (c && c.continent !== next.continent) next.continent = null;
      }
      // País × faixa de desempenho: o filtro mais recente vence o que o contradiz
      if (next.countryId != null && next.tier != null) {
        const a = this.ctxAgg().find((x) => x.country.id === next.countryId);
        if (a && tierOf(a.index) !== next.tier) {
          if (patch.tier !== undefined) next.countryId = null;
          else next.tier = null;
        }
      }
      return next;
    });
  }

  resetFilters(): void {
    const m = this.raw()?.meta;
    this.filters.set({ cropId: null, continent: null, countryId: null, tier: null, yearFrom: m?.yearMin ?? 1990, yearTo: m?.yearMax ?? 2013 });
  }

  resetPeriod(): void {
    const m = this.raw()?.meta;
    if (m) this.setFilter({ yearFrom: m.yearMin, yearTo: m.yearMax });
  }

  // ─────────── Filtragem cruzada: clique = filtro; clicar de novo = limpar ───────────
  toggleCountry(id: number): void {
    this.setFilter({ countryId: this.filters().countryId === id ? null : id });
  }
  toggleCrop(id: number): void {
    this.setFilter({ cropId: this.filters().cropId === id ? null : id });
  }
  toggleTier(tier: Tier): void {
    this.setFilter({ tier: this.filters().tier === tier ? null : tier });
  }
  toggleYear(year: number): void {
    const { yearFrom, yearTo } = this.filters();
    if (yearFrom === year && yearTo === year) this.resetPeriod();
    else this.setFilter({ yearFrom: year, yearTo: year });
  }

  // ─────────── Fatias de dados ───────────
  private inYears = (f: YieldFact) => f.year >= this.filters().yearFrom && f.year <= this.filters().yearTo;

  /** Contexto: período + cultura + continente (sem país/faixa) – base dos visuais comparativos. */
  private readonly ctx = computed(() => {
    const { cropId, continent } = this.filters();
    return this.facts().filter((f) => this.inYears(f) && (cropId == null || f.crop.id === cropId) && (continent == null || f.country.continent === continent));
  });

  /** Contexto sem o filtro de cultura (comparações entre culturas). */
  private readonly ctxAllCrops = computed(() => {
    const { continent } = this.filters();
    return this.facts().filter((f) => this.inYears(f) && (continent == null || f.country.continent === continent));
  });

  /** Países da faixa de desempenho selecionada (null = sem filtro de faixa). */
  private readonly tierIds = computed(() => {
    const tier = this.filters().tier;
    if (!tier) return null;
    return new Set(this.ctxAgg().filter((a) => tierOf(a.index) === tier).map((a) => a.country.id));
  });

  private readonly inScope = computed(() => {
    const ids = this.tierIds();
    const countryId = this.filters().countryId;
    return (f: YieldFact) => (ids == null || ids.has(f.country.id)) && (countryId == null || f.country.id === countryId);
  });

  /** Escopo: todos os filtros (inclui país e faixa) – base dos visuais analíticos. */
  readonly filtered = computed(() => this.ctx().filter(this.inScope()));
  private readonly scopedAllCrops = computed(() => this.ctxAllCrops().filter(this.inScope()));

  /** Escopo sem o filtro de período: a evolução mostra a série inteira e destaca o período escolhido. */
  private readonly scopedAllYears = computed(() => {
    const { cropId, continent } = this.filters();
    const scope = this.inScope();
    return this.facts().filter((f) => (cropId == null || f.crop.id === cropId) && (continent == null || f.country.continent === continent) && scope(f));
  });

  // ─────────── Agregação por país ───────────
  private aggregateCountries(facts: YieldFact[], metric: Metric): CountryAggDto[] {
    const rows: Omit<CountryAggDto, 'rank'>[] = [];
    for (const [, fs] of groupBy(facts, (f) => f.country.id)) {
      const byYear = [...groupBy(fs, (f) => f.year)].map(([year, g]) => ({ year, v: mean(g.map((f) => f[metric])) })).sort((a, b) => a.year - b.year);
      const series = byYear.map((p) => p.v);
      const climate = [...groupBy(fs.filter((f) => f.climate), (f) => f.year).values()].map((g) => g[0].climate!);
      const head = byYear.slice(0, 3), tail = byYear.slice(-3);
      const span = mean(tail.map((p) => p.year)) - mean(head.map((p) => p.year));
      rows.push({
        country: fs[0].country,
        value: mean(fs.map((f) => f[metric])),
        yieldT: metric === 'yieldT' ? mean(fs.map((f) => f.yieldT)) : null,
        index: mean(fs.map((f) => f.index)),
        cagr: byYear.length >= 6 ? cagr(mean(head.map((p) => p.v)), mean(tail.map((p) => p.v)), span) : null,
        cv: series.length > 1 ? std(series) / mean(series) : 0,
        rain: climate.length ? mean(climate.map((c) => c.rain)) : null,
        temp: climate.length ? mean(climate.map((c) => c.temp)) : null,
        pest: climate.length ? mean(climate.map((c) => c.pest)) : null,
        crops: new Set(fs.map((f) => f.crop.id)).size,
        observations: fs.length,
      });
    }
    return rows.sort((a, b) => b.value - a.value).map((r, i) => ({ ...r, rank: i + 1 }));
  }

  /** Todos os países do contexto, com ranking (base do mapa, ranking e rosca). */
  readonly ctxAgg = computed(() => this.aggregateCountries(this.ctx(), this.metric()));

  /** Países exibidos nos visuais comparativos: contexto ∩ faixa selecionada (mantém o ranking original). */
  readonly countryAgg = computed(() => {
    const ids = this.tierIds();
    return ids == null ? this.ctxAgg() : this.ctxAgg().filter((a) => ids.has(a.country.id));
  });

  /** Série anual da métrica (média entre países) – usada em KPIs e sparklines. */
  private readonly yearly = computed(() => {
    const m = this.metric();
    return [...groupBy(this.filtered(), (f) => f.year)].map(([year, g]) => ({ year, v: mean(g.map((f) => f[m])), yieldT: mean(g.map((f) => f.yieldT)) })).sort((a, b) => a.year - b.year);
  });

  // ─────────── KPIs ───────────
  readonly kpis = computed<KpiDto[]>(() => {
    const facts = this.filtered();
    if (!facts.length) return [];
    const agg = this.aggregateCountries(facts, this.metric());
    const metric = this.metric();
    const y = this.yearly();

    // Para KPIs de tendência usamos t/ha por cultura rebaseado (o índice relativo é ~100 por construção)
    const growthSeries = this.rebasedByCrop(facts);
    const head = growthSeries.slice(0, 3), tail = growthSeries.slice(-3);
    const growth = mean(tail.map((p) => p[1])) / mean(head.map((p) => p[1])) - 1;
    const span = mean(tail.map((p) => p[0])) - mean(head.map((p) => p[0]));

    // Yield gap: distância ao P90 da cultura no último triênio do recorte
    const lastYear = this.filters().yearTo;
    const recent = facts.filter((f) => f.year > lastYear - 3);
    const p90 = new Map<number, number>();
    for (const [cropId, g] of groupBy(recent, (f) => f.crop.id)) p90.set(cropId, quantile(g.map((f) => f.yieldT).sort((a, b) => a - b), 0.9));
    const gaps = [...groupBy(recent, (f) => `${f.country.id}|${f.crop.id}`).values()].map((g) => Math.max(0, 1 - mean(g.map((f) => f.yieldT)) / p90.get(g[0].crop.id)!));

    return [
      {
        id: 'yield',
        label: metric === 'yieldT' ? `Rendimento médio · ${this.selectedCrop()?.namePt}` : 'Índice de rendimento médio',
        value: mean(facts.map((f) => f[metric])),
        format: 'number',
        decimals: metric === 'yieldT' ? 2 : 0,
        unit: this.metricUnit(),
        delta: metric === 'yieldT' ? y.at(-1)!.v / y[0].v - 1 : null,
        higherIsBetter: true,
        spark: y.map((p) => p.v),
        hint: metric === 'yieldT' ? 'Média de t/ha entre países e anos do recorte.' : '100 = média mundial da cultura no mesmo ano. Permite comparar culturas de escalas diferentes.',
      },
      {
        id: 'growth',
        label: 'Crescimento do rendimento',
        value: growth,
        format: 'percent',
        delta: cagr(1, 1 + growth, span),
        higherIsBetter: true,
        spark: growthSeries.map((p) => p[1]),
        hint: 'Último triênio vs. primeiro triênio do período (t/ha rebaseado por cultura). Delta = CAGR anual.',
      },
      {
        id: 'gap',
        label: 'Yield gap médio',
        value: mean(gaps),
        format: 'percent',
        higherIsBetter: false,
        hint: 'Quanto, em média, cada país/cultura está abaixo do percentil 90 da cultura no último triênio. Potencial de ganho.',
      },
      {
        id: 'cv',
        label: 'Volatilidade (CV)',
        value: mean(agg.map((a) => a.cv)),
        format: 'percent',
        higherIsBetter: false,
        hint: 'Coeficiente de variação anual médio por país. Mede o risco/instabilidade da produção.',
      },
      {
        id: 'coverage',
        label: this.selectedCountry() ? 'Culturas do país' : 'Países no recorte',
        value: this.selectedCountry() ? new Set(facts.map((f) => f.crop.id)).size : agg.length,
        format: 'integer',
        hint: `${facts.length.toLocaleString('pt-BR')} observações país × cultura × ano.`,
      },
    ];
  });

  /** Média anual de t/ha rebaseada (1º ano = 100) por cultura, depois média entre culturas. */
  private rebasedByCrop(facts: YieldFact[]): [number, number][] {
    const perYear = new Map<number, number[]>();
    for (const [, g] of groupBy(facts, (f) => f.crop.id)) {
      const ys = [...groupBy(g, (f) => f.year)].map(([year, gg]) => [year, mean(gg.map((f) => f.yieldT))] as [number, number]).sort((a, b) => a[0] - b[0]);
      if (!ys.length) continue;
      const base = ys[0][1];
      for (const [year, v] of ys) (perYear.get(year) ?? perYear.set(year, []).get(year)!).push((v / base) * 100);
    }
    return [...perYear].map(([year, vs]) => [year, mean(vs)] as [number, number]).sort((a, b) => a[0] - b[0]);
  }

  // ─────────── Tendência temporal ───────────
  readonly trend = computed<{ mode: 'groups' | 'crop'; series: TrendSeriesDto[] }>(() => {
    const facts = this.scopedAllYears();
    if (this.metric() === 'yieldT') {
      const byYear = [...groupBy(facts, (f) => f.year)].sort((a, b) => a[0] - b[0]);
      const band = byYear.map(([year, g]) => {
        const s = g.map((f) => f.yieldT).sort((a, b) => a - b);
        return { year, p25: quantile(s, 0.25), p50: quantile(s, 0.5), p75: quantile(s, 0.75) };
      });
      return { mode: 'crop', series: [{ name: 'Mediana entre países', points: band.map((b) => [b.year, b.p50]), band }] };
    }
    const series = [...groupBy(facts, (f) => f.crop.group)]
      .map(([group, g]) => ({ name: group, points: this.rebasedByCrop(g) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { mode: 'groups', series };
  });

  // ─────────── Líderes por cultura (legenda do mapa) ───────────
  readonly cropLeaders = computed<CropLeaderDto[]>(() => {
    const out: CropLeaderDto[] = [];
    for (const [, g] of groupBy(this.ctxAllCrops(), (f) => f.crop.id)) {
      const ranked = [...groupBy(g, (f) => f.country.id).values()]
        .map((fs) => ({ country: fs[0].country, yieldT: mean(fs.map((f) => f.yieldT)) }))
        .sort((a, b) => b.yieldT - a.yieldT);
      const avg = mean(ranked.map((r) => r.yieldT));
      out.push({
        crop: g[0].crop,
        country: ranked[0].country,
        yieldT: ranked[0].yieldT,
        timesAvg: ranked[0].yieldT / avg,
        runnerUp: ranked[1] ?? null,
        countries: ranked.length,
      });
    }
    return out.sort((a, b) => a.crop.namePt.localeCompare(b.crop.namePt));
  });

  // ─────────── Potencial de ganho por cultura ───────────
  /**
   * Média do escopo (país/faixa selecionados) ÷ referência P90 do contexto (o que os 10% melhores
   * países já alcançam). Maior gap = maior oportunidade.
   */
  readonly cropPotential = computed(() => {
    const countryMeans = (facts: YieldFact[]) => [...groupBy(facts, (f) => f.country.id).values()].map((fs) => mean(fs.map((f) => f.yieldT)));
    const p90 = new Map([...groupBy(this.ctxAllCrops(), (f) => f.crop.id)].map(([id, g]) => [id, quantile(countryMeans(g).sort((a, b) => a - b), 0.9)]));
    return [...groupBy(this.scopedAllCrops(), (f) => f.crop.id)]
      .map(([id, g]) => {
        const means = countryMeans(g);
        const avg = mean(means);
        const ref = p90.get(id)!;
        return { crop: g[0].crop, avg, p90: ref, attainment: Math.min(1, avg / ref), countries: means.length };
      })
      .sort((a, b) => a.attainment - b.attainment);
  });

  // ─────────── Variação do rendimento por cultura ───────────
  /** Média mundial do 1º triênio vs. último triênio do recorte (1º vs. último ano se o recorte for curto). */
  readonly cropGrowthPct = computed(() => {
    const { yearFrom, yearTo } = this.filters();
    if (yearFrom === yearTo) return [];
    const w = yearTo - yearFrom >= 5 ? 2 : 0;
    return [...groupBy(this.scopedAllCrops(), (f) => f.crop.id)]
      .map(([, g]) => {
        const head = g.filter((f) => f.year <= yearFrom + w).map((f) => f.yieldT);
        const tail = g.filter((f) => f.year >= yearTo - w).map((f) => f.yieldT);
        const first = mean(head), last = mean(tail);
        return { crop: g[0].crop, first, last, change: head.length && tail.length ? last / first - 1 : NaN };
      })
      .filter((r) => !Number.isNaN(r.change))
      .sort((a, b) => b.change - a.change);
  });

  // ─────────── Mix de desempenho dos países ───────────
  /** Classifica cada país do contexto pelo índice relativo: ≥ 110 acima, ≤ 90 abaixo, entre ambos na média. */
  readonly performanceMix = computed(() => {
    const agg = this.ctxAgg();
    const groups = groupBy(agg, (a) => tierOf(a.index));
    const country = this.ctxAgg().find((a) => a.country.id === this.filters().countryId);
    const mk = (key: Tier, label: string) => {
      const list = (groups.get(key) ?? []).sort((a, b) => b.index - a.index);
      return { key, label, count: list.length, share: agg.length ? list.length / agg.length : 0, examples: list.slice(0, 3).map((a) => a.country) };
    };
    return {
      total: agg.length,
      /** Faixa do país selecionado (para destacar a fatia). */
      countryTier: country ? tierOf(country.index) : null,
      slices: [mk('above', 'Acima da média mundial'), mk('avg', 'Na média (±10%)'), mk('below', 'Abaixo da média mundial')],
    };
  });

  // ─────────── Perfil (modal do país) ───────────
  profile(countryId: number): CountryProfileDto | null {
    const agg = this.ctxAgg();
    const base = agg.find((a) => a.country.id === countryId);
    if (!base) return null;
    const m = this.metric();
    const own = this.ctx().filter((f) => f.country.id === countryId);
    const trend = [...groupBy(own, (f) => f.year)].map(([year, g]) => ({ year, value: mean(g.map((f) => f[m])) })).sort((a, b) => a.year - b.year);
    const allCrops = this.ctxAllCrops().filter((f) => f.country.id === countryId);
    const topCrops = [...groupBy(allCrops, (f) => f.crop.id)]
      .map(([, g]) => ({ crop: g[0].crop.namePt, yieldT: mean(g.map((f) => f.yieldT)), index: mean(g.map((f) => f.index)) }))
      .sort((a, b) => b.index - a.index);
    return { ...base, totalCountries: agg.length, trend, topCrops };
  }

  // ─────────── Drill-down: país selecionado, uma linha por cultura ───────────
  readonly countryDetail = computed<CountryCropDetailDto[]>(() => {
    const { countryId, cropId } = this.filters();
    if (countryId == null) return [];
    const rows: CountryCropDetailDto[] = [];
    for (const [, g] of groupBy(this.ctxAllCrops(), (f) => f.crop.id)) {
      if (cropId != null && g[0].crop.id !== cropId) continue;
      const ranked = [...groupBy(g, (f) => f.country.id)].map(([id, fs]) => ({ id, fs, y: mean(fs.map((f) => f.yieldT)) })).sort((a, b) => b.y - a.y);
      const pos = ranked.findIndex((r) => r.id === countryId);
      if (pos < 0) continue;
      const fs = ranked[pos].fs;
      const byYear = [...groupBy(fs, (f) => f.year)].map(([year, gg]) => ({ year, v: mean(gg.map((f) => f.yieldT)) })).sort((a, b) => a.year - b.year);
      const head = byYear.slice(0, 3), tail = byYear.slice(-3);
      const series = byYear.map((p) => p.v);
      rows.push({
        crop: g[0].crop,
        yieldT: ranked[pos].y,
        index: mean(fs.map((f) => f.index)),
        cagr: byYear.length >= 6 ? cagr(mean(head.map((p) => p.v)), mean(tail.map((p) => p.v)), mean(tail.map((p) => p.year)) - mean(head.map((p) => p.year))) : null,
        cv: series.length > 1 ? std(series) / mean(series) : 0,
        rank: pos + 1,
        countries: ranked.length,
      });
    }
    return rows.sort((a, b) => b.index - a.index);
  });
}

export const tierOf = (index: number): Tier => (index >= 110 ? 'above' : index <= 90 ? 'below' : 'avg');
export const TIER_LABEL: Record<Tier, string> = { above: 'Acima da média', avg: 'Na média', below: 'Abaixo da média' };
