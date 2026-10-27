import { DestroyRef, Directive, ElementRef, NgZone, inject } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';

/** Só o que a diretiva usa da instância (evita conflito entre declarações de tipo do echarts). */
type ResizableChart = Pick<import('echarts').ECharts, 'resize' | 'getWidth' | 'getHeight' | 'isDisposed'>;

/**
 * O ngx-echarts ignora o 1º disparo do ResizeObserver e cria o gráfico num setTimeout.
 * Se o container muda de largura nesse intervalo (grid se acomodando, fonte carregando,
 * seção recriada por filtro), o canvas fica preso na largura antiga e vaza para fora do card.
 * Esta diretiva observa o container e redimensiona sempre que o tamanho real divergir do gráfico.
 */
@Directive({ selector: '[echarts]' })
export class ChartAutoResize {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private chart: ResizableChart | null = null;
  private frame = 0;

  constructor() {
    const host = inject(NgxEchartsDirective);
    const sub = host.chartInit.subscribe((chart: ResizableChart) => {
      this.chart = chart;
      this.sync();
    });

    const observer = this.zone.runOutsideAngular(() => new ResizeObserver(() => this.sync()));
    observer.observe(this.el);

    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      observer.disconnect();
      cancelAnimationFrame(this.frame);
    });
  }

  private sync() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const chart = this.chart;
      if (!chart || chart.isDisposed()) return;
      const { clientWidth: w, clientHeight: h } = this.el;
      if (w > 0 && h > 0 && (Math.abs(chart.getWidth() - w) > 1 || Math.abs(chart.getHeight() - h) > 1)) chart.resize();
    });
  }
}
