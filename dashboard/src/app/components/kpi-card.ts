import { Component, computed, input } from '@angular/core';
import { KpiDto } from '../models/dto';
import { fmt, fmtPct } from '../utils/stats';

/** Cartão de KPI: número-herói + variação + sparkline (Tufte: contexto mínimo, sem chartjunk). */
@Component({
  selector: 'app-kpi-card',
  template: `
    @let k = kpi();
    <article class="card kpi" [attr.title]="k.hint">
      <header>{{ k.label }}</header>
      <div class="value">
        {{ display() }}@if (k.unit) {<small>{{ k.unit }}</small>}
      </div>
      <footer>
        @if (k.delta != null) {
          <span [class]="deltaClass()">
            <span aria-hidden="true">{{ k.delta >= 0 ? '▲' : '▼' }}</span>
            {{ deltaText() }}
          </span>
          <span class="muted">{{ k.id === 'growth' ? 'ao ano' : 'no período' }}</span>
        } @else {
          <span class="muted hint">{{ k.hint }}</span>
        }
      </footer>
      @if (path(); as p) {
        <svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
          <path [attr.d]="p.area" class="area" />
          <path [attr.d]="p.line" class="line" vector-effect="non-scaling-stroke" />
                  </svg>
      }
    </article>
  `,
  styles: `
    .kpi { position: relative; display: flex; flex-direction: column; gap: 6px; overflow: hidden; min-height: 132px; }
    header { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
    .value { font-size: 28px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
    .value small { font-size: 13px; font-weight: 500; color: var(--text-muted); margin-left: 4px; }
    footer { display: flex; gap: 6px; align-items: baseline; font-size: 12px; position: relative; z-index: 1; }
    .hint { line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .spark { position: absolute; right: 14px; top: 40px; width: 38%; height: 34px; }
    .line { fill: none; stroke: var(--accent); stroke-width: 2; }
    .area { fill: var(--accent); opacity: .1; }
  `,
})
export class KpiCard {
  readonly kpi = input.required<KpiDto>();

  protected readonly display = computed(() => {
    const k = this.kpi();
    if (k.format === 'percent') return fmtPct(k.value, 1, k.id === 'growth');
    if (k.format === 'integer') return fmt(k.value, 0);
    return fmt(k.value, k.decimals ?? 1);
  });

  protected readonly deltaText = computed(() => fmtPct(this.kpi().delta, 1, false).replace('-', ''));

  protected readonly deltaClass = computed(() => {
    const { delta, higherIsBetter } = this.kpi();
    if (delta == null || higherIsBetter == null || delta === 0) return 'muted';
    return (delta > 0) === higherIsBetter ? 'good' : 'bad';
  });

  protected readonly path = computed(() => {
    const s = this.kpi().spark;
    if (!s || s.length < 2) return null;
    const min = Math.min(...s), max = Math.max(...s), span = max - min || 1;
    const pts = s.map((v, i) => [(i / (s.length - 1)) * 100, 26 - ((v - min) / span) * 22] as [number, number]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('');
    return { line, area: `${line}L100,28L0,28Z`, last: pts.at(-1)! };
  });
}
