import { Component, computed, inject } from '@angular/core';
import { BiDataService } from '../services/bi-data.service';
import { fmt } from '../utils/stats';

/**
 * Potencial de ganho por cultura (barras de progresso).
 * Barra = média dos países ÷ referência P90 (o que os 10% melhores já alcançam).
 * Ordenado pela maior oportunidade: a mensagem é "onde investir primeiro".
 */
@Component({
  selector: 'app-crop-potential',
  template: `
    <section class="card">
      <div class="card-header">
        <div>
          <h3>Potencial de ganho por cultura</h3>
          <p>Quanto da produtividade de referência (10% melhores países) {{ data.selectedCountry() ? data.selectedCountry()!.name : 'a média' }} já atinge. Clique para filtrar.</p>
        </div>
      </div>
      @if (headline(); as h) {
        <div class="headline">
          <strong>{{ h.crop }}</strong> é a maior oportunidade: a média atinge só <strong>{{ h.pct }}%</strong> da referência — <strong>+{{ h.gain }} t/ha</strong> possíveis.
        </div>
      }
      <ul>
        @for (r of data.cropPotential(); track r.crop.id) {
          <li [class.active]="r.crop.id === data.filters().cropId" [class.dim]="data.filters().cropId != null && r.crop.id !== data.filters().cropId"
              (click)="data.toggleCrop(r.crop.id)" (keydown.enter)="data.toggleCrop(r.crop.id)" tabindex="0" role="button"
              [attr.title]="r.crop.namePt + ': média ' + fmt(r.avg, 2) + ' t/ha · referência P90 ' + fmt(r.p90, 2) + ' t/ha · ' + r.countries + ' países'">
            <span class="crop">{{ r.crop.namePt }}</span>
            <span class="track" role="meter" [attr.aria-valuenow]="r.attainment * 100" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="r.crop.namePt">
              <span class="fill" [style.width.%]="r.attainment * 100"></span>
            </span>
            <span class="pct">{{ fmt(r.attainment * 100, 0) }}%</span>
            <span class="gain">+{{ fmt(r.p90 - r.avg, r.p90 - r.avg >= 10 ? 1 : 2) }} t/ha</span>
          </li>
        }
      </ul>
      <p class="foot muted">Barra = média atual · fim do trilho = referência P90 · valor à direita = ganho possível por hectare.</p>
    </section>
  `,
  styles: `
    .headline { font-size: 13px; color: var(--text-secondary); background: var(--surface-2); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; line-height: 1.4; }
    .headline strong { color: var(--text-primary); }
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; flex: 1; justify-content: space-around; }
    li { display: grid; grid-template-columns: 104px 1fr 38px 74px; align-items: center; gap: 10px; font-size: 12px; padding: 4px 6px; border-radius: 6px; }
    li { cursor: pointer; transition: opacity .2s; }
    li:hover, li:focus-visible { background: var(--surface-2); outline: none; }
    li.active { background: color-mix(in srgb, var(--accent) 14%, transparent); }
    li.dim { opacity: .4; }
    .crop { color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .track { position: relative; height: 12px; background: var(--surface-2); border-radius: 6px; }
    .track::after { content: ''; position: absolute; right: 0; top: -3px; bottom: -3px; width: 2px; border-radius: 1px; background: var(--text-muted); }
    .fill { position: absolute; inset: 0 auto 0 0; background: var(--accent); border-radius: 6px; transition: width .4s ease; }
    .pct { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
    .gain { text-align: right; color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .foot { font-size: 11px; margin: 10px 0 0; }
  `,
})
export class CropPotential {
  protected readonly data = inject(BiDataService);
  protected readonly fmt = fmt;

  protected readonly headline = computed(() => {
    const rows = this.data.cropPotential();
    if (!rows.length) return null;
    const top = rows[0]; // lista já ordenada pelo menor atingimento
    const g = top.p90 - top.avg;
    return { crop: top.crop.namePt, pct: fmt(top.attainment * 100, 0), gain: fmt(g, g >= 10 ? 1 : 2) };
  });
}
