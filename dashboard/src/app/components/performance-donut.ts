import { Component, computed, inject } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ChartAutoResize } from '../utils/chart-auto-resize.directive';
import type { EChartsOption } from 'echarts';
import { BiDataService } from '../services/bi-data.service';
import { ThemeService } from '../services/theme.service';
import { fmt } from '../utils/stats';

/** Rosca parte-de-um-todo (3 fatias): quantos países estão acima, na média ou abaixo da média mundial. */
@Component({
  selector: 'app-performance-donut',
  imports: [NgxEchartsDirective, ChartAutoResize],
  template: `
    <section class="card">
      <div class="card-header">
        <div>
          <h3>Desempenho dos países</h3>
          <p>Países pelo índice frente à média mundial{{ data.filters().continent ? ' · ' + data.filters().continent : '' }}. Clique numa fatia para filtrar.</p>
        </div>
      </div>
      <div echarts class="chart donut" [options]="options()" (chartClick)="onClick($event)"></div>
      <ul class="legend">
        @for (s of mix().slices; track s.key; let i = $index) {
          <li [class.active]="data.filters().tier === s.key" [class.dim]="data.filters().tier != null && data.filters().tier !== s.key">
            <span class="swatch" [style.background]="colors()[i]"></span>
            <button type="button" class="label" (click)="data.toggleTier(s.key)">{{ s.label }}</button>
            <span class="count">{{ s.count }} <small>({{ fmt(s.share * 100, 0) }}%)</small></span>
            <span class="flags">
              @for (c of s.examples; track c.id) {
                <img [src]="'flags/' + c.iso2 + '.svg'" [alt]="c.name" [title]="c.name" [class.on]="c.id === data.filters().countryId" (click)="data.toggleCountry(c.id)" />
              }
            </span>
          </li>
        }
      </ul>
    </section>
  `,
  styles: `
    .donut { min-height: 220px !important; }
    .legend { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .legend li { display: grid; grid-template-columns: 10px 1fr auto auto; align-items: center; gap: 8px; font-size: 12px; }
    .swatch { width: 10px; height: 10px; border-radius: 3px; }
    .legend li { padding: 2px 4px; border-radius: 6px; transition: opacity .2s; }
    .legend li.active { background: color-mix(in srgb, var(--accent) 14%, transparent); }
    .legend li.dim { opacity: .45; }
    .label { border: 0; background: transparent; padding: 0; font: inherit; text-align: left; cursor: pointer; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .label:hover { color: var(--accent); text-decoration: underline; }
    .count { font-weight: 600; font-variant-numeric: tabular-nums; }
    .count small { font-weight: 400; color: var(--text-muted); }
    .flags { display: flex; gap: 3px; min-width: 66px; justify-content: flex-end; }
    .flags img { width: 20px; height: 15px; object-fit: cover; border-radius: 2px; box-shadow: 0 0 0 1px var(--border); cursor: pointer; }
    .flags img.on { box-shadow: 0 0 0 2px var(--accent); }
  `,
})
export class PerformanceDonut {
  protected readonly data = inject(BiDataService);
  private readonly theme = inject(ThemeService);
  protected readonly fmt = fmt;
  protected readonly mix = this.data.performanceMix;

  /** Acima = azul, média = neutro, abaixo = vermelho (polos divergentes + meio neutro). */
  protected readonly colors = computed(() => {
    const t = this.theme.tokens();
    return [t.diverging.pos[1], t.axis, t.diverging.neg[0]];
  });

  protected readonly options = computed<EChartsOption>(() => {
    const t = this.theme.tokens();
    const { total, slices, countryTier } = this.mix();
    const tier = this.data.filters().tier;
    const focus = () => slices.find((s) => s.key === (tier ?? countryTier)) ?? slices[0];
    const base = this.theme.base();
    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        trigger: 'item',
        formatter: (p: any) => `<b>${p.name}</b><br/>${p.value} países · ${fmt(p.percent, 0)}%`,
      },
      title: {
        text: `${fmt(focus().share * 100, 0)}%`,
        subtext: `${focus().key === 'above' ? 'acima da média' : focus().key === 'avg' ? 'na média' : 'abaixo da média'}\n${total} países`,
        left: 'center',
        top: '36%',
        textStyle: { color: t.text, fontSize: 30, fontWeight: 600, fontFamily: 'Inter, sans-serif' },
        subtextStyle: { color: t.textMuted, fontSize: 11, lineHeight: 15 },
        itemGap: 4,
      },
      series: [
        {
          type: 'pie',
          radius: ['62%', '86%'],
          center: ['50%', '50%'],
          startAngle: 90,
          padAngle: 2,
          itemStyle: { borderRadius: 4, borderColor: t.surface, borderWidth: 2 },
          label: { show: false },
          emphasis: { scale: true, scaleSize: 4 },
          cursor: 'pointer',
          data: slices.map((s, i) => ({
            name: s.label,
            value: s.count,
            tier: s.key,
            // Fatia filtrada (ou a do país filtrado) em destaque; demais esmaecem
            itemStyle: { color: this.colors()[i], opacity: (tier ?? countryTier) == null || (tier ?? countryTier) === s.key ? 1 : 0.3 },
          })) as any,
        },
      ],
    };
  });

  protected onClick(e: any) {
    if (e?.data?.tier) this.data.toggleTier(e.data.tier);
  }
}
