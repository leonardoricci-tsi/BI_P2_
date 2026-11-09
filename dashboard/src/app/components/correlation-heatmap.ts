import { Component, computed, inject } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ChartAutoResize } from '../utils/chart-auto-resize.directive';
import type { EChartsOption } from 'echarts';
import { BiDataService } from '../services/bi-data.service';
import { ThemeService } from '../services/theme.service';
import { fmt } from '../utils/stats';

const FACTORS = [
  { key: 'rain', label: 'Chuva' },
  { key: 'temp', label: 'Temperatura' },
  { key: 'pest', label: 'Pesticidas' },
] as const;

/**
 * Heatmap de correlação (escala divergente −1…+1): qual fator acompanha o rendimento de cada cultura.
 * Recalculado a cada filtro de período, continente, país e faixa.
 */
@Component({
  selector: 'app-correlation-heatmap',
  imports: [NgxEchartsDirective, ChartAutoResize],
  template: `
    <section class="card">
      <div class="card-header">
        <div>
          <h3>Correlação dos fatores com o rendimento</h3>
          <p>ρ de Spearman entre t/ha e cada fator, por cultura (observações país × ano). Azul = sobe junto, vermelho = sentido oposto, vazio = menos de 8 observações. Clique na linha para filtrar a cultura.</p>
        </div>
      </div>
      <div echarts class="chart" [options]="options()" (chartClick)="onClick($event)"></div>
    </section>
  `,
})
export class CorrelationHeatmap {
  protected readonly data = inject(BiDataService);
  private readonly theme = inject(ThemeService);

  protected readonly options = computed<EChartsOption>(() => {
    const t = this.theme.tokens();
    const rows = this.data.cropCorrelations();
    const sel = this.data.filters().cropId;
    const cells = rows.flatMap((r, y) =>
      FACTORS.map((f, x) => {
        const v = r[f.key];
        return {
          value: [x, y, Number.isNaN(v) ? '-' : +v.toFixed(2)],
          cropId: r.crop.id,
          n: r.n,
          itemStyle: sel != null && r.crop.id !== sel ? { opacity: 0.35 } : undefined,
        };
      }),
    );
    const base = this.theme.base();
    return {
      ...base,
      grid: { left: 8, right: 8, top: 8, bottom: 48, containLabel: true },
      xAxis: { type: 'category', data: FACTORS.map((f) => f.label), position: 'top', ...this.theme.axis({ axisLine: { show: false }, splitArea: { show: false } }) },
      yAxis: {
        type: 'category',
        data: rows.map((r) => r.crop.namePt),
        inverse: true,
        ...this.theme.axis({ axisLine: { show: false } }),
        axisLabel: { color: t.textSecondary, fontSize: 11, fontWeight: (v: string) => (rows.find((r) => r.crop.namePt === v)?.crop.id === sel ? 'bold' : 'normal') } as any,
      },
      visualMap: {
        min: -1,
        max: 1,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemHeight: 160,
        itemWidth: 10,
        text: ['+1', '−1'],
        textStyle: { color: t.textMuted, fontSize: 11 },
        inRange: { color: [t.diverging.neg[0], t.diverging.neg[1], t.diverging.mid, t.diverging.pos[0], t.diverging.pos[1]] },
      },
      tooltip: {
        ...base.tooltip,
        trigger: 'item',
        formatter: (p: any) => {
          const [x, y, v] = p.data.value;
          return `<b>${rows[y].crop.namePt}</b> × ${FACTORS[x].label}<br/>ρ = <b>${v === '-' ? '—' : fmt(v, 2)}</b><br/><span style="opacity:.7">${p.data.n.toLocaleString('pt-BR')} observações</span>`;
        },
      },
      series: [
        {
          type: 'heatmap',
          data: cells as any,
          cursor: 'pointer',
          label: { show: true, fontSize: 11, color: t.text, formatter: (p: any) => (p.data.value[2] === '-' ? '—' : fmt(p.data.value[2], 2)) },
          itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
          emphasis: { itemStyle: { borderColor: t.highlight, borderWidth: 1 } },
        },
      ],
    };
  });

  protected onClick(e: any) {
    if (e?.data?.cropId != null) this.data.toggleCrop(e.data.cropId);
  }
}
