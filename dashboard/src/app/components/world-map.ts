import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ChartAutoResize } from '../utils/chart-auto-resize.directive';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { firstValueFrom } from 'rxjs';
import { BiDataService } from '../services/bi-data.service';
import { ThemeService } from '../services/theme.service';
import { CountryModal } from './country-modal';
import { CountryDimDto, CountryProfileDto } from '../models/dto';
import { fmt, quantile } from '../utils/stats';

interface HoverState {
  profile: CountryProfileDto;
  x: number;
  y: number;
}

/**
 * Coroplético mundial (rendimento por país).
 * Classes por quantis (5) – distribuição assimétrica, cada cor = 20% dos países.
 * Hover abre o modal do país; clique fixa o modal.
 */
@Component({
  selector: 'app-world-map',
  host: { '(document:keydown.escape)': 'data.focusCountry.set(null)' },
  imports: [NgxEchartsDirective, ChartAutoResize, CountryModal],
  template: `
    <section class="card map-card" #host>
      <div class="card-header">
        <div>
          <h3>Mapa global · {{ data.metricLabel() }}</h3>
          <p>Média do recorte {{ data.filters().yearFrom }}–{{ data.filters().yearTo }}. Classes por quintil · passe o mouse para ver o perfil, clique para filtrar o painel pelo país.</p>
        </div>
        <span class="chip">{{ data.countryAgg().length }} países</span>
      </div>
      <div class="map-body">
        @if (ready()) {
          <div echarts class="map" [options]="options()" (chartInit)="chart = $event" (chartMouseOver)="onOver($event)" (chartMouseOut)="scheduleClose()" (chartClick)="onClick($event)"></div>
        } @else {
          <div class="map loading">Carregando geometrias…</div>
        }

        <!-- Legenda: quem lidera cada cultura no recorte -->
        <aside class="leaders" aria-label="Líderes de rendimento por cultura">
          <h4>Quem lidera cada cultura</h4>
          <p class="muted">Maior rendimento médio (t/ha){{ data.filters().continent ? ' · ' + data.filters().continent : '' }} · {{ data.filters().yearFrom }}–{{ data.filters().yearTo }}</p>
          <ul>
            @for (l of data.cropLeaders(); track l.crop.id) {
              <li [class.active]="l.crop.id === data.filters().cropId || l.country.id === data.filters().countryId"
                  (mouseenter)="highlight(l.country, true)" (mouseleave)="highlight(l.country, false)"
                  [attr.title]="l.runnerUp ? '2º lugar: ' + l.runnerUp.country.name + ' (' + fmt(l.runnerUp.yieldT, 2) + ' t/ha) · ' + l.countries + ' países plantam' : l.countries + ' país'">
                <button type="button" class="crop" [class.on]="l.crop.id === data.filters().cropId" (click)="data.toggleCrop(l.crop.id)" [attr.aria-label]="'Filtrar por ' + l.crop.namePt">{{ l.crop.namePt }}</button>
                <button type="button" class="who" [class.on]="l.country.id === data.filters().countryId" (click)="data.toggleCountry(l.country.id)" [attr.aria-label]="'Filtrar por ' + l.country.name">
                  <img class="flag" [src]="'flags/' + l.country.iso2 + '.svg'" alt="" />
                  <span class="name">{{ l.country.name }}</span>
                </button>
                <span class="val">{{ fmt(l.yieldT, l.yieldT >= 10 ? 1 : 2) }} <small>t/ha</small></span>
                <span class="times">{{ fmt(l.timesAvg, 1) }}× a média</span>
              </li>
            }
          </ul>
        </aside>
      </div>
      @if (hover(); as h) {
        <div class="floating" [style.left.px]="h.x" [style.top.px]="h.y" (mouseenter)="cancelClose()" (mouseleave)="scheduleClose()">
          <app-country-modal [profile]="h.profile" [metricLabel]="data.metricLabel()" [unit]="data.metricUnit()" />
        </div>
      }
    </section>

    @if (pinned(); as p) {
      <div class="backdrop" (click)="data.focusCountry.set(null)">
        <div (click)="$event.stopPropagation()">
          <app-country-modal [profile]="p" [pinned]="true" [metricLabel]="data.metricLabel()" [unit]="data.metricUnit()" (closed)="data.focusCountry.set(null)" />
        </div>
      </div>
    }
  `,
  styles: `
    /* O modal do hover flutua além do card; o canvas segue contido pelo .map (overflow: hidden) */
    .map-card { position: relative; overflow: visible; }
    .map-body { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 12px; }
    .map { width: 100%; height: 560px; overflow: hidden; }
    .leaders { border-left: 1px solid var(--border); padding-left: 12px; display: flex; flex-direction: column; min-width: 0; }
    .leaders h4 { font-size: 13px; }
    .leaders > p { font-size: 11px; margin: 2px 0 8px; }
    .leaders ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
    .leaders li {
      display: grid; grid-template-columns: 1fr auto; grid-template-areas: "crop val" "who times";
      gap: 1px 8px; padding: 6px 8px; border-radius: 8px; font-size: 12px;
    }
    .leaders li:hover { background: var(--surface-2); }
    .leaders li.active { background: color-mix(in srgb, var(--accent) 14%, transparent); }
    .crop, .who { border: 0; background: transparent; padding: 0; font: inherit; color: inherit; cursor: pointer; text-align: left; justify-self: start; max-width: 100%; }
    .crop:hover, .who:hover .name, .crop.on, .who.on .name { color: var(--accent); text-decoration: underline; }
    .crop:focus-visible, .who:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-radius: 4px; }
    .crop { grid-area: crop; color: var(--text-muted); font-size: 11px; }
    .who { grid-area: who; display: flex; align-items: center; gap: 6px; min-width: 0; }
    .flag { width: 20px; height: 15px; flex-shrink: 0; border-radius: 2px; object-fit: cover; box-shadow: 0 0 0 1px var(--border); }
    .name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .val { grid-area: val; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
    .val small { font-weight: 400; color: var(--text-muted); font-size: 10px; }
    .times { grid-area: times; text-align: right; color: var(--text-muted); font-size: 11px; white-space: nowrap; }
    @media (max-width: 900px) {
      .map-body { grid-template-columns: minmax(0, 1fr); }
      .leaders { border-left: 0; border-top: 1px solid var(--border); padding: 12px 0 0; }
      .leaders ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
    }
    .loading { display: grid; place-items: center; color: var(--text-muted); }
    .floating { position: absolute; z-index: 20; }
    .backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,.35); display: grid; place-items: center; padding: 16px; backdrop-filter: blur(2px); }
    @media (max-width: 640px) { .map { height: 300px; } }
  `,
})
export class WorldMap {
  protected readonly data = inject(BiDataService);
  private readonly theme = inject(ThemeService);
  private readonly http = inject(HttpClient);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  protected readonly ready = signal(false);
  protected readonly hover = signal<HoverState | null>(null);
  /** Modal fixado – compartilhado com ranking/tabela via BiDataService.focusCountry. */
  protected readonly pinned = computed(() => {
    const id = this.data.focusCountry();
    return id == null ? null : this.data.profile(id);
  });
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  protected chart: { dispatchAction(a: object): void } | null = null;
  protected readonly fmt = fmt;

  constructor() {
    this.registerMap();
  }

  private async registerMap() {
    if (!echarts.getMap('world')) {
      const geo = await firstValueFrom(this.http.get<any>('data/world.geojson'));
      echarts.registerMap('world', geo);
    }
    this.ready.set(true);
  }

  protected readonly options = computed<EChartsOption>(() => {
    const t = this.theme.tokens();
    const agg = this.data.countryAgg();
    const unit = this.data.metricUnit();
    const dec = unit === 't/ha' ? 2 : 0;
    const values = agg.map((a) => a.value).sort((a, b) => a - b);
    const breaks = [0.2, 0.4, 0.6, 0.8].map((q) => quantile(values, q));
    const edges = [values[0], ...breaks, values.at(-1)!];
    const ramp = [t.sequential[0], t.sequential[2], t.sequential[3], t.sequential[4], t.sequential[6]];
    const pieces = ramp.map((color, i) => ({
      min: edges[i],
      max: i === 4 ? edges[5] + 1e-9 : edges[i + 1],
      color,
      label: `${fmt(edges[i], dec)} – ${fmt(edges[i + 1], dec)}`,
    }));

    const mapped = agg.filter((a) => a.country.geoName);
    const islands = agg.filter((a) => !a.country.geoName);
    // Filtro de país: o selecionado ganha contorno; os demais esmaecem, mas continuam clicáveis
    const sel = this.data.filters().countryId;
    const style = (id: number) =>
      sel == null ? undefined : id === sel ? { borderColor: t.highlight, borderWidth: 2, opacity: 1 } : { opacity: 0.3 };

    return {
      ...this.theme.base(),
      tooltip: { show: false },
      visualMap: [{
        type: 'piecewise' as const,
        seriesIndex: 0,
        pieces: [...pieces].reverse(),
        orient: 'vertical',
        left: 8,
        bottom: 8,
        itemWidth: 14,
        itemHeight: 10,
        itemGap: 4,
        textStyle: { color: t.textSecondary, fontSize: 11 },
        showLabel: true,
        text: [unit, ''],
        textGap: 6,
      }, {
        type: 'piecewise' as const,
        show: false,
        seriesIndex: 1,
        dimension: 2,
        pieces,
      }],
      geo: {
        map: 'world',
        roam: 'move',
        scaleLimit: { min: 1, max: 8 },
        // Encaixa o mundo inteiro na área disponível (largura muda com a legenda de líderes)
        zoom: 1,
        left: 4,
        right: 4,
        top: 'middle',
        itemStyle: { areaColor: t.noData, borderColor: t.surface, borderWidth: 0.6 },
        emphasis: { label: { show: false }, itemStyle: { areaColor: t.categorical[1], borderColor: t.highlight, borderWidth: 1 } },
        select: { disabled: true },
        // Com geoIndex, o estilo por país precisa ir em geo.regions (o itemStyle da série é ignorado)
        regions: sel == null ? [] : mapped.map((a) => ({ name: a.country.geoName!, itemStyle: style(a.country.id) })),
      },
      series: [
        {
          type: 'map',
          map: 'world',
          geoIndex: 0,
          data: mapped.map((a) => ({ name: a.country.geoName!, value: a.value, countryId: a.country.id })) as any,
        },
        {
          // Países sem polígono no Natural Earth 110m (Bahrain, Mauritius) → ponto na coordenada
          type: 'scatter' as const,
          coordinateSystem: 'geo',
          symbolSize: 10,
          itemStyle: { borderColor: t.surface, borderWidth: 2 },
          emphasis: { scale: 1.6 },
          data: islands.map((a) => ({ name: a.country.name, value: [a.country.lon, a.country.lat, a.value], countryId: a.country.id, itemStyle: style(a.country.id) })) as any,
        },
      ],
    };
  });

  /** Eventos podem vir da série (com data.countryId) ou do componente geo (só com o nome do polígono). */
  private countryIdOf(e: any): number | null {
    if (e?.data?.countryId != null) return e.data.countryId;
    const c = e?.name ? this.data.countries().find((x) => x.geoName === e.name || x.name === e.name) : null;
    return c && this.data.countryAgg().some((a) => a.country.id === c.id) ? c.id : null;
  }

  protected onOver(e: any) {
    const id = this.countryIdOf(e);
    if (id == null) return;
    const profile = this.data.profile(id);
    if (!profile) return;
    this.cancelClose();
    const hostEl = this.host().nativeElement;
    const w = hostEl.clientWidth;
    const ev = e.event?.event as MouseEvent | undefined;
    const rect = hostEl.getBoundingClientRect();
    const mx = ev ? ev.clientX - rect.left : w / 2;
    const my = ev ? ev.clientY - rect.top : 80;
    const modalW = Math.min(340, w - 32);
    // Abre do lado oposto ao cursor para não cobrir o país em foco
    const x = mx + 24 + modalW < w ? mx + 24 : Math.max(16, mx - modalW - 24);
    const y = Math.max(56, Math.min(my - 60, hostEl.clientHeight - 380));
    this.hover.set({ profile, x, y });
  }

  protected onClick(e: any) {
    const id = this.countryIdOf(e);
    if (id == null) return;
    this.hover.set(null);
    this.data.toggleCountry(id);
  }

  /** Destaca no mapa o país apontado na legenda de líderes. */
  protected highlight(country: CountryDimDto, on: boolean) {
    this.chart?.dispatchAction(
      country.geoName
        ? { type: on ? 'highlight' : 'downplay', seriesIndex: 0, name: country.geoName }
        : { type: on ? 'highlight' : 'downplay', seriesIndex: 1, name: country.name },
    );
  }

  protected scheduleClose() {
    this.cancelClose();
    this.closeTimer = setTimeout(() => this.hover.set(null), 220);
  }

  protected cancelClose() {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }
}
