import { Component, computed, inject, signal } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ChartAutoResize } from '../utils/chart-auto-resize.directive';
import type { EChartsOption } from 'echarts';
import { BiDataService } from '../services/bi-data.service';
import { ThemeService } from '../services/theme.service';
import { fmt } from '../utils/stats';

/** Ranking (barras horizontais ordenadas): comparação de magnitude entre categorias nominais. */
@Component({
  selector: 'app-ranking-chart',
  imports: [NgxEchartsDirective, ChartAutoResize],
  template: `
    <section class="card">
      <div class="card-header">
        <div>
          <h3>Ranking de países</h3>
          <p>{{ data.metricLabel() }} · linha tracejada = mediana do recorte. Clique para filtrar pelo país.</p>
        </div>
        <div class="seg" role="tablist">
          <button type="button" [class.active]="side() === 'top'" (click)="side.set('top')">Top 12</button>
          <button type="button" [class.active]="side() === 'bottom'" (click)="side.set('bottom')">Últimos 12</button>
        </div>
      </div>
      <div echarts class="chart tall" [options]="options()" (chartClick)="onClick($event)"></div>
    </section>
  `,
  styles: `.tall { height: 380px; }`,
})
export class RankingChart {
  protected readonly data = inject(BiDataService);
  private readonly theme = inject(ThemeService);
  protected readonly side = signal<'top' | 'bottom'>('top');

  protected readonly options = computed<EChartsOption>(() => {
    const t = this.theme.tokens();
    const agg = this.data.countryAgg();
    const sel = this.data.filters().countryId;
    let list = this.side() === 'top' ? agg.slice(0, 12) : agg.slice(-12);
    // País filtrado fora da lista: entra no lugar do último para mostrar sua posição
    const selRow = agg.find((a) => a.country.id === sel);
    if (selRow && !list.includes(selRow)) list = [...list.slice(0, 11), selRow].sort((a, b) => a.rank - b.rank);
    const rows = list.slice().reverse();
    const median = agg.length ? agg[Math.floor(agg.length / 2)].value : 0;
    const dec = this.data.metric() === 'yieldT' ? 2 : 0;
    const color = this.side() === 'top' ? t.categorical[0] : t.categorical[1];
    const base = this.theme.base();
    return {
      ...base,
      grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value', ...this.theme.axis(), axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: {
        type: 'category',
        data: rows.map((r) => `${r.rank}. ${r.country.name}`),
        ...this.theme.axis({ axisLine: { show: false } }),
        axisLabel: { color: t.textSecondary, fontSize: 11 },
      },
      tooltip: {
        ...base.tooltip,
        trigger: 'item',
        formatter: (p: any) => {
          const r = rows[p.dataIndex];
          return `<b>${r.country.name}</b> · ${r.country.continent}<br/>${this.data.metricLabel()}: <b>${fmt(r.value, dec)}</b><br/>Posição: ${r.rank} de ${agg.length}`;
        },
      },
      series: [
        {
          type: 'bar',
          data: rows.map((r) => ({
            value: r.value,
            countryId: r.country.id,
            itemStyle: sel == null ? undefined : r.country.id === sel ? { color: t.highlight } : { opacity: 0.3 },
          })) as any,
          barWidth: '62%',
          itemStyle: { color, borderRadius: [0, 4, 4, 0] },
          emphasis: { itemStyle: { color: t.highlight } },
          label: { show: true, position: 'right', color: t.textSecondary, fontSize: 11, formatter: (p: any) => fmt(p.value, dec) },
          cursor: 'pointer',
          markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.textMuted, type: 'dashed' }, data: [{ xAxis: median }] },
        },
      ],
    };
  });

  protected onClick(e: any) {
    if (e?.data?.countryId != null) this.data.toggleCountry(e.data.countryId);
  }
}
