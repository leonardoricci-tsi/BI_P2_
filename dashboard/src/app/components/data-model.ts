import { Component, inject } from '@angular/core';
import { BiDataService } from '../services/bi-data.service';

/** Documentação visual do modelo dimensional (esquema estrela) usado pelo painel. */
@Component({
  selector: 'app-data-model',
  template: `
    <section class="card">
      <div class="card-header">
        <div>
          <h3>Modelo dimensional (esquema estrela)</h3>
          <p>Dois fatos em grãos diferentes, ligados por dimensões conformadas (País e Tempo). Gerado por <code>etl/build_dataset.py</code>.</p>
        </div>
      </div>
      <div class="star">
        <div class="tbl dim" style="grid-area: pais">
          <b>dim_pais</b><span class="n">{{ data.countries().length }} linhas</span>
          <ul><li class="pk">id</li><li>name · iso3</li><li>continent · region</li><li>lat · lon</li></ul>
        </div>
        <div class="tbl dim" style="grid-area: cultura">
          <b>dim_cultura</b><span class="n">{{ data.crops().length }} linhas</span>
          <ul><li class="pk">id</li><li>name · namePt</li><li>group</li></ul>
        </div>
        <div class="tbl dim" style="grid-area: tempo">
          <b>dim_tempo</b><span class="n">{{ data.years().length }} linhas</span>
          <ul><li class="pk">year</li><li>decade · period</li></ul>
        </div>
        <div class="tbl fact" style="grid-area: prod">
          <b>fato_producao</b><span class="n">{{ data.raw()?.factYield?.rows?.length }} linhas</span>
          <ul><li class="fk">countryId → dim_pais</li><li class="fk">cropId → dim_cultura</li><li class="fk">year → dim_tempo</li><li>yieldT (t/ha)</li></ul>
        </div>
        <div class="tbl fact" style="grid-area: clima">
          <b>fato_clima</b><span class="n">{{ data.raw()?.factClimate?.rows?.length }} linhas</span>
          <ul><li class="fk">countryId → dim_pais</li><li class="fk">year → dim_tempo</li><li>rain · temp · pest</li></ul>
        </div>
      </div>
      <p class="legend"><span class="pk">PK</span> chave primária · <span class="fk">FK</span> chave estrangeira (1:N) · Medidas derivadas na camada semântica: índice relativo, CAGR, CV, yield gap, ρ de Spearman.</p>
    </section>
  `,
  styles: `
    .star { display: grid; gap: 14px; grid-template-columns: repeat(3, 1fr); grid-template-areas: "pais prod cultura" "tempo clima ."; }
    .tbl { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; font-size: 12px; background: var(--surface-1); }
    .tbl b { font-size: 13px; }
    .n { float: right; color: var(--text-muted); font-size: 11px; }
    .fact { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, var(--surface-1)); }
    ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; color: var(--text-secondary); font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
    .pk::before, .fk::before { font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 4px; margin-right: 6px; font-family: Inter, sans-serif; }
    .pk::before { content: 'PK'; background: var(--surface-2); color: var(--text-primary); }
    .fk::before { content: 'FK'; background: var(--accent); color: #fff; }
    .legend { font-size: 11px; color: var(--text-muted); margin: 12px 0 0; }
    .legend .pk::before, .legend .fk::before { content: none; }
    .legend .pk, .legend .fk { font-weight: 700; }
    code { font-size: 11px; }
    @media (max-width: 760px) { .star { grid-template-columns: 1fr; grid-template-areas: "prod" "clima" "pais" "cultura" "tempo"; } }
  `,
})
export class DataModel {
  protected readonly data = inject(BiDataService);
}
