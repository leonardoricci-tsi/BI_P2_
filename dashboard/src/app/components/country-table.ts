import { Component, computed, inject, signal } from '@angular/core';
import { BiDataService } from '../services/bi-data.service';
import { CountryAggDto } from '../models/dto';
import { fmt, fmtPct } from '../utils/stats';

type SortKey = 'rank' | 'name' | 'continent' | 'value' | 'cagr' | 'cv' | 'rain' | 'temp' | 'pest';

/** Tabela analítica (visão detalhada / drill-down) com ordenação, busca e barras inline. */
@Component({
  selector: 'app-country-table',
  template: `
    <section class="card">
      @if (data.selectedCountry(); as c) {
        <!-- Drill-down: país filtrado → uma linha por cultura -->
        <div class="card-header">
          <div>
            <h3 class="drill"><img [src]="'flags/' + c.iso2 + '.svg'" alt="" /> {{ c.name }} · detalhe por cultura</h3>
            <p>Posição do país entre todos os que plantam cada cultura no recorte. Clique numa cultura para filtrar.</p>
          </div>
          <button type="button" class="back" (click)="data.setFilter({ countryId: null })">‹ Voltar para todos os países</button>
        </div>
        <div class="scroll">
          <table>
            <thead>
              <tr><th>Cultura</th><th>Grupo</th><th class="num">Rendimento (t/ha)</th><th class="num">Índice</th><th class="num">Posição</th><th class="num">CAGR</th><th class="num">Volat. (CV)</th></tr>
            </thead>
            <tbody>
              @for (r of data.countryDetail(); track r.crop.id) {
                <tr (click)="data.toggleCrop(r.crop.id)" tabindex="0" (keydown.enter)="data.toggleCrop(r.crop.id)" [class.sel]="r.crop.id === data.filters().cropId">
                  <td class="strong">{{ r.crop.namePt }}</td>
                  <td class="muted">{{ r.crop.group }}</td>
                  <td class="num">{{ fmt(r.yieldT, 2) }}</td>
                  <td class="num bar-cell">
                    <span class="bar" [style.width.%]="(r.index / maxDetailIndex()) * 55"></span>
                    <span class="v">{{ fmt(r.index, 0) }}</span>
                  </td>
                  <td class="num"><strong>{{ r.rank }}º</strong> <span class="muted">de {{ r.countries }}</span></td>
                  <td class="num" [class.good]="(r.cagr ?? 0) > 0" [class.bad]="(r.cagr ?? 0) < 0">{{ fmtPct(r.cagr) }}</td>
                  <td class="num">{{ fmtPct(r.cv, 1, false) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="muted empty">Sem dados deste país para o recorte.</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
      <div class="card-header">
        <div>
          <h3>Tabela analítica por país</h3>
          <p>Clique no cabeçalho para ordenar e na linha para filtrar o painel pelo país. {{ data.metric() === 'index' ? 'No modo índice, CAGR mede o ganho relativo à média mundial.' : '' }}</p>
        </div>
        <input type="search" placeholder="Buscar país…" [value]="query()" (input)="query.set($any($event.target).value)" aria-label="Buscar país" />
      </div>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              @for (c of cols; track c.key) {
                <th [class.num]="c.num" (click)="sortBy(c.key)" [attr.aria-sort]="sort().key === c.key ? (sort().dir === 1 ? 'ascending' : 'descending') : null">
                  {{ c.label }}
                  @if (sort().key === c.key) { <span aria-hidden="true">{{ sort().dir === 1 ? '↑' : '↓' }}</span> }
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (r of page(); track r.country.id) {
              <tr (click)="data.toggleCountry(r.country.id)" tabindex="0" (keydown.enter)="data.toggleCountry(r.country.id)">
                <td class="num muted">{{ r.rank }}</td>
                <td class="strong">{{ r.country.name }}</td>
                <td class="muted">{{ r.country.continent }}</td>
                <td class="num bar-cell">
                  <span class="bar" [style.width.%]="(r.value / maxValue()) * 55"></span>
                  <span class="v">{{ fmt(r.value, dec()) }}</span>
                </td>
                <td class="num" [class.good]="(r.cagr ?? 0) > 0" [class.bad]="(r.cagr ?? 0) < 0">{{ fmtPct(r.cagr) }}</td>
                <td class="num">{{ fmtPct(r.cv, 1, false) }}</td>
                <td class="num">{{ fmt(r.rain, 0) }}</td>
                <td class="num">{{ fmt(r.temp, 1) }}</td>
                <td class="num">{{ fmt(r.pest, 0) }}</td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="muted empty">Nenhum país encontrado.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <footer>
        <span class="muted">{{ rows().length }} países · página {{ pageIdx() + 1 }} de {{ pages() }}</span>
        <div class="seg">
          <button type="button" [disabled]="pageIdx() === 0" (click)="pageIdx.set(pageIdx() - 1)">‹ Anterior</button>
          <button type="button" [disabled]="pageIdx() >= pages() - 1" (click)="pageIdx.set(pageIdx() + 1)">Próxima ›</button>
        </div>
      </footer>
      }
    </section>
  `,
  styles: `
    input[type=search] { padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-1); min-width: 180px; }
    .scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .03em; padding: 8px 10px; border-bottom: 1px solid var(--border); cursor: pointer; white-space: nowrap; user-select: none; }
    th:hover { color: var(--text-primary); }
    td { padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    tbody tr { cursor: pointer; }
    tbody tr:hover, tbody tr:focus-visible { background: var(--surface-2); outline: none; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .strong { font-weight: 500; }
    .bar-cell { position: relative; min-width: 120px; }
    .bar { position: absolute; left: 10px; top: 50%; height: 14px; transform: translateY(-50%); background: var(--accent); opacity: .18; border-radius: 0 4px 4px 0; max-width: calc(100% - 20px); }
    .v { position: relative; }
    .empty { text-align: center; padding: 24px; }
    footer { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 12px; }
    .seg button:disabled { opacity: .4; cursor: default; }
    .drill { display: flex; align-items: center; gap: 8px; }
    .drill img { width: 24px; height: 18px; object-fit: cover; border-radius: 3px; box-shadow: 0 0 0 1px var(--border); }
    .back { border: 1px solid var(--border); background: transparent; padding: 7px 12px; border-radius: 8px; cursor: pointer; color: var(--text-secondary); white-space: nowrap; }
    .back:hover { background: var(--surface-2); }
    tr.sel { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  `,
})
export class CountryTable {
  protected readonly data = inject(BiDataService);
  protected readonly fmt = fmt;
  protected readonly fmtPct = fmtPct;
  protected readonly cols: { key: SortKey; label: string; num?: boolean }[] = [
    { key: 'rank', label: '#', num: true },
    { key: 'name', label: 'País' },
    { key: 'continent', label: 'Continente' },
    { key: 'value', label: 'Rendimento', num: true },
    { key: 'cagr', label: 'CAGR', num: true },
    { key: 'cv', label: 'Volat. (CV)', num: true },
    { key: 'rain', label: 'Chuva mm', num: true },
    { key: 'temp', label: 'Temp °C', num: true },
    { key: 'pest', label: 'Pestic. t', num: true },
  ];
  private readonly pageSize = 12;

  protected readonly query = signal('');
  protected readonly sort = signal<{ key: SortKey; dir: 1 | -1 }>({ key: 'rank', dir: 1 });
  protected readonly pageIdx = signal(0);
  protected readonly dec = computed(() => (this.data.metric() === 'yieldT' ? 2 : 0));
  protected readonly maxDetailIndex = computed(() => Math.max(...this.data.countryDetail().map((r) => r.index), 1));
  protected readonly maxValue = computed(() => Math.max(...this.data.countryAgg().map((r) => r.value), 1));

  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const { key, dir } = this.sort();
    const get = (r: CountryAggDto): string | number => (key === 'name' ? r.country.name : key === 'continent' ? r.country.continent : (r[key] ?? -Infinity));
    return this.data
      .countryAgg()
      .filter((r) => !q || r.country.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const va = get(a), vb = get(b);
        return (typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number)) * dir;
      });
  });

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.rows().length / this.pageSize)));
  protected readonly page = computed(() => {
    const idx = Math.min(this.pageIdx(), this.pages() - 1);
    return this.rows().slice(idx * this.pageSize, (idx + 1) * this.pageSize);
  });

  protected sortBy(key: SortKey) {
    this.sort.update((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'rank' || key === 'name' || key === 'continent' ? 1 : -1 }));
    this.pageIdx.set(0);
  }
}
