import { Component, computed, inject } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ChartAutoResize } from '../utils/chart-auto-resize.directive';
import type { EChartsOption } from 'echarts';
import { BiDataService } from '../services/bi-data.service';
import { ThemeService } from '../services/theme.service';
import { fmt } from '../utils/stats';

/**
 * Boxplot por continente: mostra a distribuição (mediana, quartis, extremos e outliers)
 * da métrica entre os países, e não só a média. Responde "quão desigual é cada continente?".
 */
@Component({
  selector: 'app-continent-boxplot',
  imports: [NgxEchartsDirective, ChartAutoResize],
  template: `
    <section class="card">
      <div class="card-header">
        <div>
          <h3>Desigualdade entre países, por continente</h3>
          <p>{{ data.metricLabel() }} · caixa = 50% centrais dos países, traço = mediana, pontos = países atípicos (fora de 1,5 × IQR). Clique no continente para filtrar.</p>
        </div>
      </div>
      <div echarts class="chart" [options]="options()" (chartClick)="onClick($event)"></div>
    </section>
  `,
})
export class ContinentBoxplot {
  protected readonly data = inject(BiDataService);
  private readonly theme = inject(ThemeService);

  protected readonly options = computed<EChartsOption>(() => {
    const t = this.theme.tokens();
    const dist = this.data.continentDistribution();
    const selCont = this.data.filters().continent;
    const selCountry = this.data.filters().countryId;
    const dec = this.data.metric() === 'yieldT' ? 2 : 0;
    const names = dist.map((d) => d.continent);
    const selRow = dist.flatMap((d) => d.countries).find((a) => a.country.id === selCountry);
    const base = this.theme.base();
    return {
      ...base,
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: names, ...this.theme.axis({ splitLine: { show: false } }), axisLabel: { color: t.textSecondary, fontSize: 11, formatter: (v: string) => `${v}\n(${dist.find((d) => d.continent === v)?.n} países)` } },
      yAxis: { type: 'value', name: this.data.metricUnit(), scale: true, ...this.theme.axis() },
      tooltip: { ...base.tooltip, trigger: 'item' },
      series: [
        {
          name: 'Distribuição',
          type: 'boxplot',
          cursor: 'pointer',
          boxWidth: ['30%', '55%'],
          data: dist.map((d) => ({
            value: d.box,
            continent: d.continent,
            itemStyle: {
              color: selCont === d.continent ? `${t.categorical[0]}55` : `${t.categorical[0]}22`,
              borderColor: t.categorical[0],
              borderWidth: selCont === d.continent ? 2.5 : 1.5,
              opacity: selCont == null || selCont === d.continent ? 1 : 0.4,
            },
          })) as any,
          tooltip: {
            formatter: (p: any) => {
              const d = dist[p.dataIndex];
              const [lo, q1, q2, q3, hi] = d.box;
              return `<b>${d.continent}</b> · ${d.n} países<br/>Máx. (sem atípicos): ${fmt(hi, dec)}<br/>3º quartil: ${fmt(q3, dec)}<br/>Mediana: <b>${fmt(q2, dec)}</b><br/>1º quartil: ${fmt(q1, dec)}<br/>Mín. (sem atípicos): ${fmt(lo, dec)}`;
            },
          },
        },
        {
          name: 'Atípicos',
          type: 'scatter',
          symbolSize: 7,
          cursor: 'pointer',
          itemStyle: { color: t.categorical[1] },
          data: dist.flatMap((d) => d.outliers.map((o) => ({ value: [d.continent, o.value], row: o }))) as any,
          tooltip: { formatter: (p: any) => `<b>${p.data.row.country.name}</b> (atípico)<br/>${fmt(p.data.row.value, dec)} ${this.data.metricUnit()}` },
        },
        {
          name: 'País selecionado',
          type: 'scatter',
          symbol: 'diamond',
          symbolSize: 14,
          z: 10,
          itemStyle: { color: t.highlight, borderColor: t.surface, borderWidth: 2 },
          data: selRow ? ([{ value: [selRow.country.continent, selRow.value], row: selRow }] as any) : [],
          tooltip: { formatter: (p: any) => `<b>${p.data.row.country.name}</b><br/>${fmt(p.data.row.value, dec)} ${this.data.metricUnit()}` },
        },
      ],
    };
  });

  protected onClick(e: any) {
    if (e?.data?.row) this.data.toggleCountry(e.data.row.country.id);
    else if (e?.data?.continent) this.data.toggleContinent(e.data.continent);
  }
}
