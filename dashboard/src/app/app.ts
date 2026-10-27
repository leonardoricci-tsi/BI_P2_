import { Component, inject } from '@angular/core';
import { BiDataService } from './services/bi-data.service';
import { ThemeService } from './services/theme.service';
import { FilterBar } from './components/filter-bar';
import { KpiCard } from './components/kpi-card';
import { WorldMap } from './components/world-map';
import { TrendChart } from './components/trend-chart';
import { RankingChart } from './components/ranking-chart';
import { CropPotential } from './components/crop-potential';
import { CropGrowth } from './components/crop-growth';
import { PerformanceDonut } from './components/performance-donut';
import { CountryTable } from './components/country-table';
import { DataModel } from './components/data-model';

@Component({
  selector: 'app-root',
  imports: [FilterBar, KpiCard, WorldMap, TrendChart, RankingChart, CropPotential, CropGrowth, PerformanceDonut, CountryTable, DataModel],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly data = inject(BiDataService);
  protected readonly theme = inject(ThemeService);

  constructor() {
    this.data.load();
  }
}
