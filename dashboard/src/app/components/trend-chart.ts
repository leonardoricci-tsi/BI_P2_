import { Component, computed, inject } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ChartAutoResize } from '../utils/chart-auto-resize.directive';
import type { EChartsOption } from 'echarts';
import { BiDataService } from '../services/bi-data.service';
import { ThemeService } from '../services/theme.service';
import { fmt } from '../utils/stats';

/**
 * Evolução temporal.
 * - Todas as culturas: índice base 100 no 1º ano por grupo de cultura (escalas diferentes → indexar a uma base comum).
 * - Uma cultura: mediana entre países + faixa interquartil (P25–P75) mostrando a dispersão.
 */
@Component({
  selector: 'app-trend-chart',
  imports: [NgxEchartsDirective, ChartAutoResize],
  styles: `.clickable { cursor: pointer; }`,
  template: `
    <section class="card">
      <div class="card-header">
        <div>
          <h3>Evolução do rendimento</h3>
          <p>{{ subtitle() }} Clique em um ano para filtrar o painel.</p>
        </div>
      </div>
      <div echarts class="chart clickable" [options]="options()" (chartInit)="onInit($event)"></div>
    </section>
  `,
})
export class TrendChart {
  private readonly data = inject(BiDataService);
  private readonly theme = inject(ThemeService);

  protected readonly subtitle = computed(() =>
    this.data.trend().mode === 'groups'
      ? `Índice (${this.data.raw()?.meta.yearMin} = 100) por grupo de cultura — velocidade de ganho de produtividade.`
      : `${this.data.selectedCrop()?.namePt}: mediana entre países (linha) e faixa interquartil P25–P75 (área), em t/ha.`,
  );

  protected readonly options = computed<EChartsOption>(() => {
    const t = this.theme.tokens();
    const { mode, series } = this.data.trend();
    const base = this.theme.base();
    // Período filtrado: faixa destacada (ou linha, se for um único ano)
    const { yearFrom, yearTo } = this.data.filters();
    const full = this.data.isFullPeriod();
    const x = (y: number) => (mode === 'crop' ? String(y) : y);
    const selection = {
      type: 'line' as const,
      data: [],
      silent: true,
      markArea: full || yearFrom === yearTo ? undefined : { silent: true, itemStyle: { color: t.categorical[1], opacity: 0.12 }, data: [[{ xAxis: x(yearFrom) }, { xAxis: x(yearTo) }]] as any },
      markLine: full || yearFrom !== yearTo ? undefined : { silent: true, symbol: 'none', lineStyle: { color: t.categorical[1], width: 2, type: 'solid' as const }, label: { show: false }, data: [{ xAxis: x(yearFrom) }] as any },
    };
    const common: EChartsOption = {
      ...base,
      grid: { left: 48, right: mode === 'groups' ? 170 : 24, top: 28, bottom: 28 },
      xAxis: { type: 'value', min: 'dataMin', max: 'dataMax', ...this.theme.axis({ splitLine: { show: false } }), axisLabel: { color: t.textMuted, formatter: (v: number) => String(v) } },
      tooltip: { ...base.tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: t.axis } } },
    };

    if (mode === 'crop') {
      const band = series[0].band!;
      return {
        ...common,
        // Eixo categórico: o empilhamento P25 + (P75−P25) só funciona com eixo de categoria
        xAxis: { type: 'category', boundaryGap: false, data: band.map((b) => String(b.year)), ...this.theme.axis({ splitLine: { show: false } }) },
        yAxis: { type: 'value', name: 't/ha', ...this.theme.axis() },
        tooltip: {
          ...common.tooltip,
          formatter: (ps: any) => {
            const b = band[ps[0].dataIndex];
            return `<b>${b.year}</b><br/>Mediana: <b>${fmt(b.p50, 2)} t/ha</b><br/><span style="color:${t.textMuted}">P25–P75: ${fmt(b.p25, 2)} – ${fmt(b.p75, 2)}</span>`;
          },
        },
        series: [
          { name: 'P25', type: 'line', data: band.map((b) => b.p25), lineStyle: { opacity: 0 }, stack: 'iqr', symbol: 'none', silent: true },
          { name: 'IQR', type: 'line', data: band.map((b) => b.p75 - b.p25), lineStyle: { opacity: 0 }, stack: 'iqr', symbol: 'none', areaStyle: { color: t.categorical[0], opacity: 0.15 }, silent: true },
          { name: 'Mediana', type: 'line', data: band.map((b) => b.p50), symbol: 'circle', symbolSize: 6, showSymbol: false, lineStyle: { width: 2, color: t.categorical[0] }, itemStyle: { color: t.categorical[0] } },
          selection,
        ],
      };
    }

    return {
      ...common,
      yAxis: { type: 'value', ...this.theme.axis(), scale: true },
      legend: { show: true, top: 0, left: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 4, textStyle: { color: t.textSecondary, fontSize: 11 } },
      tooltip: { ...common.tooltip, valueFormatter: (v: any) => fmt(Array.isArray(v) ? v[1] : v, 1) },
      series: [
        ...series.map((s, i) => ({
          name: s.name,
          type: 'line' as const,
          data: s.points,
          showSymbol: false,
          symbolSize: 8,
          lineStyle: { width: 2, color: t.categorical[i] },
          itemStyle: { color: t.categorical[i], borderColor: t.surface, borderWidth: 2 },
          // Rótulo direto no fim da linha (≤ 4 séries)
          endLabel: { show: true, formatter: (p: any) => `${p.seriesName}  ${fmt(p.value[1], 0)}`, color: t.textSecondary, fontSize: 11 },
          labelLayout: { moveOverlap: 'shiftY' as const },
        })),
        { type: 'line', data: [], markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.axis, type: 'dashed' }, data: [{ yAxis: 100 }] } },
        selection,
      ],
    };
  });

  /** Clique em qualquer ponto da área do gráfico → filtra pelo ano mais próximo (toggle). */
  protected onInit(chart: any) {
    chart.getZr().on('click', (e: { offsetX: number; offsetY: number }) => {
      const px = [e.offsetX, e.offsetY];
      if (!chart.containPixel('grid', px)) return;
      const v = chart.convertFromPixel({ xAxisIndex: 0 }, px[0]);
      const years = this.data.years();
      const year = this.data.trend().mode === 'crop' ? Number(chart.getOption().xAxis[0].data[Math.round(v)]) : Math.round(v);
      if (years.includes(year)) this.data.toggleYear(year);
    });
  }
}
