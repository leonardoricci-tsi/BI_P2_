import { Component, computed, inject } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ChartAutoResize } from '../utils/chart-auto-resize.directive';
import type { EChartsOption } from 'echarts';
import { BiDataService } from '../services/bi-data.service';
import { ThemeService } from '../services/theme.service';
import { fmt, fmtPct } from '../utils/stats';

/** Variação do rendimento por cultura: barras divergentes a partir do zero (ganhou × perdeu). */
@Component({
  selector: 'app-crop-growth',
  imports: [NgxEchartsDirective, ChartAutoResize],
  template: `
    <section class="card">
      <div class="card-header">
        <div>
          <h3>Quem ganhou produtividade</h3>
          <p>Variação do rendimento médio{{ data.selectedCountry() ? ' em ' + data.selectedCountry()!.name : ' mundial' }} por cultura, {{ period() }}. Clique para filtrar.</p>
        </div>
      </div>
      @if (headline(); as h) {
        <div class="headline">
          <strong>{{ h.up }}</strong> de {{ h.total }} culturas ficaram mais produtivas. Destaque: <strong>{{ h.best }}</strong> ({{ h.bestPct }}).
        </div>
      }
      @if (data.filters().yearFrom === data.filters().yearTo) {
        <div class="chart empty muted">Selecione um período com mais de um ano para comparar a variação.</div>
      } @else {
        <div echarts class="chart" [options]="options()" (chartClick)="onClick($event)"></div>
      }
    </section>
  `,
  styles: `
    .headline { font-size: 13px; color: var(--text-secondary); background: var(--surface-2); border-radius: 8px; padding: 8px 10px; margin-bottom: 4px; line-height: 1.4; }
    .headline strong { color: var(--text-primary); }
    .empty { display: grid; place-items: center; text-align: center; padding: 24px; font-size: 13px; }
  `,
})
export class CropGrowth {
  protected readonly data = inject(BiDataService);
  private readonly theme = inject(ThemeService);

  protected readonly period = computed(() => {
    const { yearFrom, yearTo } = this.data.filters();
    return yearTo - yearFrom >= 5 ? `${yearFrom}–${yearFrom + 2} vs. ${yearTo - 2}–${yearTo}` : `${yearFrom} vs. ${yearTo}`;
  });

  protected readonly headline = computed(() => {
    const rows = this.data.cropGrowthPct();
    if (!rows.length) return null;
    return { up: rows.filter((r) => r.change > 0).length, total: rows.length, best: rows[0].crop.namePt, bestPct: fmtPct(rows[0].change, 0) };
  });

  protected readonly options = computed<EChartsOption>(() => {
    const t = this.theme.tokens();
    const rows = [...this.data.cropGrowthPct()].reverse(); // maior no topo
    const sel = this.data.filters().cropId;
    const base = this.theme.base();
    return {
      ...base,
      grid: { left: 8, right: 52, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value', ...this.theme.axis(), axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: {
        type: 'category',
        data: rows.map((r) => r.crop.namePt),
        ...this.theme.axis({ axisLine: { show: false } }),
        axisLabel: { color: t.textSecondary, fontSize: 11 },
      },
      tooltip: {
        ...base.tooltip,
        trigger: 'item',
        formatter: (p: any) => {
          const r = rows[p.dataIndex];
          return `<b>${r.crop.namePt}</b><br/>${fmt(r.first, 2)} → <b>${fmt(r.last, 2)} t/ha</b><br/>Variação: <b>${fmtPct(r.change, 1)}</b>`;
        },
      },
      series: [
        {
          type: 'bar',
          barWidth: '58%',
          cursor: 'pointer',
          data: rows.map((r) => ({
            value: +(r.change * 100).toFixed(1),
            cropId: r.crop.id,
            itemStyle: {
              color: r.change >= 0 ? t.diverging.pos[1] : t.diverging.neg[0],
              opacity: sel == null || sel === r.crop.id ? 1 : 0.35,
              borderRadius: r.change >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
            },
          })),
          label: {
            show: true,
            position: 'right',
            color: t.textSecondary,
            fontSize: 11,
            formatter: (p: any) => `${p.value > 0 ? '+' : ''}${fmt(p.value, 0)}%`,
          },
          markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.axis, type: 'solid' }, data: [{ xAxis: 0 }] },
        },
      ],
    };
  });

  protected onClick(e: any) {
    if (e?.data?.cropId != null) this.data.toggleCrop(e.data.cropId);
  }
}
