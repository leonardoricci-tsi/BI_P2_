import { Component, computed, input, output } from '@angular/core';
import { CountryProfileDto } from '../models/dto';
import { fmt, fmtPct } from '../utils/stats';

/** Modal de detalhes do país – abre no hover do mapa e pode ser fixado com clique. */
@Component({
  selector: 'app-country-modal',
  host: {
    role: 'dialog',
    '[attr.aria-modal]': 'pinned()',
    '[attr.aria-label]': '"Detalhes de " + profile().country.name',
  },
  template: `
    @let p = profile();
    <div class="modal" [class.pinned]="pinned()">
      <header>
        <img class="flag" [src]="'flags/' + p.country.iso2 + '.svg'" [alt]="'Bandeira de ' + p.country.name" />
        <div>
          <h3>{{ p.country.name }}</h3>
          <span class="muted">{{ p.country.region }} · {{ p.country.continent }} · {{ p.country.iso3 }}</span>
        </div>
        <div class="rank">
          <strong>#{{ p.rank }}</strong>
          <span class="muted">de {{ p.totalCountries }}</span>
        </div>
        @if (pinned()) {
          <button type="button" class="close" (click)="closed.emit()" aria-label="Fechar" title="Fechar (Esc)">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          </button>
        }
      </header>

      <div class="hero">
        <div>
          <span class="label">{{ metricLabel() }}</span>
          <span class="big">{{ fmt(p.value, unit() === 't/ha' ? 2 : 0) }} <small>{{ unit() }}</small></span>
        </div>
        @if (trendPath(); as t) {
          <svg viewBox="0 0 160 44" class="spark" aria-hidden="true">
            <path [attr.d]="t.line" />
            <circle [attr.cx]="t.last[0]" [attr.cy]="t.last[1]" r="3" />
          </svg>
        }
      </div>

      <dl class="grid">
        <div><dt>Crescimento (CAGR)</dt><dd [class]="p.cagr == null ? '' : p.cagr >= 0 ? 'good' : 'bad'">{{ fmtPct(p.cagr) }} a.a.</dd></div>
        <div><dt>Volatilidade (CV)</dt><dd>{{ fmtPct(p.cv, 1, false) }}</dd></div>
        <div><dt>Chuva média</dt><dd>{{ fmt(p.rain, 0) }} mm/ano</dd></div>
        <div><dt>Temperatura média</dt><dd>{{ fmt(p.temp, 1) }} °C</dd></div>
        <div><dt>Pesticidas</dt><dd>{{ fmt(p.pest, 0) }} t</dd></div>
        <div><dt>Culturas · obs.</dt><dd>{{ p.crops }} · {{ p.observations }}</dd></div>
      </dl>

      @if (p.topCrops.length) {
        <section>
          <h4>Desempenho por cultura <span class="muted">(índice, 100 = média mundial)</span></h4>
          <ul class="bars">
            @for (c of p.topCrops.slice(0, pinned() ? 10 : 4); track c.crop) {
              <li>
                <span class="name">{{ c.crop }}</span>
                <span class="track"><span class="fill" [style.width.%]="barWidth(c.index)"></span><span class="ref" [style.left.%]="barWidth(100)"></span></span>
                <span class="num">{{ fmt(c.index, 0) }}</span>
                @if (pinned()) { <span class="num muted">{{ fmt(c.yieldT, 2) }} t/ha</span> }
              </li>
            }
          </ul>
        </section>
      }
      @if (!pinned()) {
        <footer class="muted">Clique para filtrar o painel por este país (clique de novo para desfazer)</footer>
      }
    </div>
  `,
  styles: `
    .modal {
      width: 340px; max-width: calc(100vw - 32px); background: var(--surface-1); border: 1px solid var(--border);
      border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.18); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px;
      animation: pop .14s ease-out;
    }
    .modal.pinned { width: 440px; position: relative; padding-top: 18px; }
    .pinned header { padding-right: 36px; }
    @keyframes pop { from { opacity: 0; transform: translateY(4px) scale(.98); } }
    header { display: flex; gap: 12px; align-items: center; }
    .flag { width: 44px; height: 33px; flex-shrink: 0; border-radius: 4px; object-fit: cover; box-shadow: 0 0 0 1px var(--border); }
    .pinned .flag { width: 56px; height: 42px; }
    header > div:first-child { flex: 1; min-width: 0; }
    h3 { font-size: 17px; }
    header .muted { font-size: 12px; }
    .rank { display: flex; flex-direction: column; align-items: flex-end; font-size: 12px; }
    .rank strong { font-size: 18px; }
    .close {
      position: absolute; top: 10px; right: 10px; display: grid; place-items: center;
      width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px;
      background: transparent; color: var(--text-muted); cursor: pointer; transition: background .15s, color .15s;
    }
    .close:hover { background: var(--surface-2); color: var(--text-primary); }
    .close:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .hero { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; padding: 10px 12px; background: var(--surface-2); border-radius: 10px; }
    .hero > div { display: flex; flex-direction: column; gap: 2px; }
    .label { font-size: 11px; color: var(--text-muted); }
    .big { font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .big small { font-size: 12px; color: var(--text-muted); font-weight: 500; }
    .spark { width: 140px; height: 40px; flex-shrink: 0; }
    .spark path { fill: none; stroke: var(--accent); stroke-width: 2; }
    .spark circle { fill: var(--accent); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 0; }
    dt { font-size: 11px; color: var(--text-muted); }
    dd { margin: 0; font-weight: 500; font-variant-numeric: tabular-nums; }
    h4 { font-size: 12px; font-weight: 600; margin-bottom: 6px; }
    h4 .muted { font-weight: 400; }
    .bars { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
    .bars li { display: grid; grid-template-columns: 96px 1fr 34px auto; align-items: center; gap: 8px; font-size: 12px; }
    .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-secondary); }
    .track { position: relative; height: 8px; background: var(--surface-2); border-radius: 4px; }
    .fill { position: absolute; inset: 0 auto 0 0; background: var(--accent); border-radius: 4px; }
    .ref { position: absolute; top: -3px; bottom: -3px; width: 1px; background: var(--text-muted); }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    footer { font-size: 11px; text-align: center; }
  `,
})
export class CountryModal {
  readonly profile = input.required<CountryProfileDto>();
  readonly pinned = input(false);
  readonly metricLabel = input('');
  readonly unit = input('');
  readonly closed = output<void>();

  protected readonly fmt = fmt;
  protected readonly fmtPct = fmtPct;

  private readonly maxIndex = computed(() => Math.max(150, ...this.profile().topCrops.map((c) => c.index)));
  protected barWidth = (v: number) => Math.min(100, (v / this.maxIndex()) * 100);

  protected readonly trendPath = computed(() => {
    const t = this.profile().trend;
    if (t.length < 2) return null;
    const vs = t.map((p) => p.value);
    const min = Math.min(...vs), max = Math.max(...vs), span = max - min || 1;
    const x0 = t[0].year, xs = t.at(-1)!.year - x0 || 1;
    const pts = t.map((p) => [4 + ((p.year - x0) / xs) * 152, 40 - ((p.value - min) / span) * 34] as [number, number]);
    return { line: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(''), last: pts.at(-1)! };
  });
}
