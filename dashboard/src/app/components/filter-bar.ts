import { Component, inject } from '@angular/core';
import { BiDataService, TIER_LABEL } from '../services/bi-data.service';

@Component({
  selector: 'app-filter-bar',
  template: `
    <div class="filters" role="group" aria-label="Filtros globais">
      <label>
        <span>Cultura</span>
        <select (change)="onCrop($event)">
          <option value="" [selected]="data.filters().cropId == null">Todas (índice relativo)</option>
          @for (c of data.crops(); track c.id) {
            <option [value]="c.id" [selected]="c.id === data.filters().cropId">{{ c.namePt }} · {{ c.group }}</option>
          }
        </select>
      </label>
      <label>
        <span>Continente</span>
        <select (change)="onContinent($event)">
          <option value="" [selected]="data.filters().continent == null">Todos</option>
          @for (c of data.continents(); track c) {
            <option [value]="c" [selected]="c === data.filters().continent">{{ c }}</option>
          }
        </select>
      </label>
      <label>
        <span>País</span>
        <select (change)="onCountry($event)">
          <option value="" [selected]="data.filters().countryId == null">Todos</option>
          @for (c of data.countryOptions(); track c.id) {
            <option [value]="c.id" [selected]="c.id === data.filters().countryId">{{ c.name }}</option>
          }
        </select>
      </label>
      <label>
        <span>De</span>
        <select (change)="onYear($event, 'yearFrom')">
          @for (y of data.years(); track y) { <option [value]="y" [selected]="y === data.filters().yearFrom">{{ y }}</option> }
        </select>
      </label>
      <label>
        <span>Até</span>
        <select (change)="onYear($event, 'yearTo')">
          @for (y of data.years(); track y) { <option [value]="y" [selected]="y === data.filters().yearTo">{{ y }}</option> }
        </select>
      </label>
      <button type="button" class="reset" (click)="data.resetFilters()" [disabled]="!data.hasFilters()">Limpar filtros</button>
    </div>

    <!-- Filtros ativos: mostra o que cada clique no painel filtrou e permite remover um a um -->
    @if (data.hasFilters()) {
      <div class="active" aria-label="Filtros ativos">
        <span class="muted">Filtrando por:</span>
        @if (data.selectedCountry(); as c) {
          <span class="tag">
            <img [src]="'flags/' + c.iso2 + '.svg'" alt="" />{{ c.name }}
            <button type="button" class="link" (click)="data.focusCountry.set(c.id)">Ver perfil</button>
            <button type="button" class="x" (click)="data.setFilter({ countryId: null })" [attr.aria-label]="'Remover filtro ' + c.name">×</button>
          </span>
        }
        @if (data.selectedCrop(); as c) {
          <span class="tag">{{ c.namePt }}<button type="button" class="x" (click)="data.setFilter({ cropId: null })" aria-label="Remover filtro de cultura">×</button></span>
        }
        @if (data.filters().continent; as c) {
          <span class="tag">{{ c }}<button type="button" class="x" (click)="data.setFilter({ continent: null })" aria-label="Remover filtro de continente">×</button></span>
        }
        @if (data.filters().tier; as t) {
          <span class="tag">{{ tierLabel[t] }}<button type="button" class="x" (click)="data.setFilter({ tier: null })" aria-label="Remover filtro de desempenho">×</button></span>
        }
        @if (!data.isFullPeriod()) {
          <span class="tag">
            {{ data.filters().yearFrom === data.filters().yearTo ? data.filters().yearFrom : data.filters().yearFrom + '–' + data.filters().yearTo }}
            <button type="button" class="x" (click)="data.resetPeriod()" aria-label="Remover filtro de período">×</button>
          </span>
        }
      </div>
    } @else {
      <div class="active muted hint">Dica: clique em qualquer país, cultura, fatia ou ano dos gráficos para filtrar o painel inteiro. Clique de novo para desfazer.</div>
    }
  `,
  styles: `
    .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
    label { display: flex; flex-direction: column; gap: 4px; }
    label span { font-size: 11px; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
    select {
      appearance: none; min-width: 120px; max-width: 220px; padding: 7px 30px 7px 10px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--surface-1)
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%237a7975' fill='none' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 10px center;
      cursor: pointer;
    }
    select:focus-visible, .reset:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .reset { border: 1px solid var(--border); background: transparent; padding: 7px 12px; border-radius: 8px; cursor: pointer; color: var(--text-secondary); }
    .reset:hover:not(:disabled) { background: var(--surface-2); }
    .reset:disabled { opacity: .45; cursor: default; }
    .active { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; min-height: 26px; font-size: 12px; }
    .hint { font-size: 11px; }
    .tag {
      display: inline-flex; align-items: center; gap: 6px; padding: 3px 4px 3px 10px; border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 14%, var(--surface-1)); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
      font-weight: 500;
    }
    .tag img { width: 16px; height: 12px; object-fit: cover; border-radius: 2px; }
    .x { border: 0; background: transparent; width: 18px; height: 18px; border-radius: 50%; cursor: pointer; color: var(--text-secondary); display: grid; place-items: center; padding: 0; font-size: 14px; line-height: 1; }
    .x:hover { background: var(--surface-2); color: var(--text-primary); }
    .link { border: 0; background: transparent; padding: 0 2px; color: var(--accent); cursor: pointer; font-size: 11px; text-decoration: underline; }
    @media (max-width: 640px) { label { flex: 1 1 40%; } select { width: 100%; min-width: 0; max-width: none; } }
  `,
})
export class FilterBar {
  protected readonly data = inject(BiDataService);
  protected readonly tierLabel = TIER_LABEL;

  onCrop(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    this.data.setFilter({ cropId: v === '' ? null : +v });
  }
  onContinent(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    this.data.setFilter({ continent: v || null });
  }
  onCountry(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    this.data.setFilter({ countryId: v === '' ? null : +v });
  }
  onYear(e: Event, key: 'yearFrom' | 'yearTo') {
    this.data.setFilter({ [key]: +(e.target as HTMLSelectElement).value });
  }
}
