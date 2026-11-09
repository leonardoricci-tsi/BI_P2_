import { Component, computed, inject, signal } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ChartAutoResize } from '../utils/chart-auto-resize.directive';
import type { EChartsOption } from 'echarts';
import { BiDataService, ClimateFactor } from '../services/bi-data.service';
import { ThemeService } from '../services/theme.service';
import { fmt } from '../utils/stats';

const FACTORS: { key: ClimateFactor; label: string; unit: string; axis: string }[] = [
  { key: 'pest', label: 'Pesticidas', unit: 't', axis: 'Pesticidas (t/ano, escala log)' },
  { key: 'rain', label: 'Chuva', unit: 'mm/ano', axis: 'Chuva média (mm/ano)' },
  { key: 'temp', label: 'Temperatura', unit: '°C', axis: 'Temperatura média (°C)' },
];

/**
 * Dispersão: rendimento do país × fator climático/insumo.
 * Cada ponto é um país (média do recorte); cor = continente.
 * Usa o relacionamento fato_producao ↔ fato_clima pela chave (país, ano).
 */
@Component({
  selector: 'app-climate-scatter',
  imports: [NgxEchartsDirective, ChartAutoResize],
  template: `
    <section class="card">
      <div class="card-header">
        <div>
          <h3>Rendimento × {{ factor().label.toLowerCase() }}</h3>
          <p>
            Cada ponto é um país · {{ data.metricLabel() }}.
            ρ de Spearman = <b>{{ fmt(corr().rho, 2) }}</b> ({{ strength() }}, n = {{ corr().n }}). Clique para filtrar.
          </p>
        </div>
        <div class="seg" role="tablist">
          @for (f of factors; track f.key) {
            <button type="button" [class.active]="factorKey() === f.key" (click)="factorKey.set(f.key)">{{ f.label }}</button>
          }
        </div>
      </div>
      <div echarts class="chart" [options]="options()" (chartClick)="onClick($event)"></div>
    </section>
  `,
})
export class ClimateScatter {
  protected readonly data = inject(BiDataService);
  private readonly theme = inject(ThemeService);
  protected readonly fmt = fmt;
  protected readonly factors = FACTORS;
  protected readonly factorKey = signal<ClimateFactor>('pest');
  protected readonly factor = computed(() => FACTORS.find((f) => f.key === this.factorKey())!);
  protected readonly corr = computed(() => this.data.countryCorrelation(this.factorKey()));

  protected readonly strength = computed(() => {
    const r = Math.abs(this.corr().rho);
    if (Number.isNaN(r)) return 'amostra insuficiente';
    const dir = this.corr().rho > 0 ? 'positiva' : 'negativa';
    return r >= 0.5 ? `forte, ${dir}` : r >= 0.3 ? `moderada, ${dir}` : 'fraca';
  });

  protected readonly options = computed<EChartsOption>(() => {
    const t = this.theme.tokens();
    const f = this.factor();
    const key = f.key;
    const sel = this.data.filters().countryId;
    const dec = this.data.metric() === 'yieldT' ? 2 : 0;
    const continents = this.data.continents();
    // Log não aceita zero: pesticidas ≤ 0 ficam fora da dispersão
    const pts = this.data.countryAgg().filter((a) => a[key] != null && (key !== 'pest' || a[key]! > 0));
    const base = this.theme.base();
    return {
      ...base,
      color: t.categorical,
      legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: t.textSecondary, fontSize: 11 }, icon: 'circle' },
      grid: { left: 8, right: 16, top: 48, bottom: 28, containLabel: true },
      xAxis: { type: key === 'pest' ? 'log' : 'value', name: f.axis, nameLocation: 'middle', nameGap: 26, scale: true, ...this.theme.axis() },
      yAxis: { type: 'value', name: this.data.metricUnit(), scale: true, ...this.theme.axis() },
      tooltip: {
        ...base.tooltip,
        trigger: 'item',
        formatter: (p: any) => {
          const a = p.data.row;
          return `<b>${a.country.name}</b> · ${a.country.continent}<br/>${this.data.metricLabel()}: <b>${fmt(a.value, dec)}</b><br/>${f.label}: <b>${fmt(a[key], key === 'temp' ? 1 : 0)}</b> ${f.unit}`;
        },
      },
      series: continents.map((c) => ({
        name: c,
        type: 'scatter' as const,
        symbolSize: 9,
        cursor: 'pointer',
        data: pts
          .filter((a) => a.country.continent === c)
          .map((a) => ({
            value: [a[key]!, a.value],
            row: a,
            itemStyle: sel == null ? { opacity: 0.8 } : a.country.id === sel ? { color: t.highlight, opacity: 1, borderColor: t.surface, borderWidth: 2 } : { opacity: 0.2 },
            symbolSize: a.country.id === sel ? 16 : 9,
          })),
        emphasis: { focus: 'series' as const },
      })) as any,
    };
  });

  protected onClick(e: any) {
    const id = e?.data?.row?.country?.id;
    if (id != null) this.data.toggleCountry(id);
  }
}
