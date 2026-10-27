import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

/** Tokens de cor dos gráficos – espelham as variáveis CSS de styles.scss. */
export interface ChartTokens {
  surface: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  grid: string;
  axis: string;
  border: string;
  categorical: string[];
  sequential: string[];
  diverging: { neg: string[]; mid: string; pos: string[] };
  noData: string;
  highlight: string;
}

const LIGHT: ChartTokens = {
  surface: '#fcfcfb',
  text: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#7a7975',
  grid: '#ebeae6',
  axis: '#c9c8c2',
  border: '#ffffff',
  categorical: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  sequential: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  diverging: { neg: ['#e34948', '#f09a99'], mid: '#f0efec', pos: ['#9ec5f4', '#2a78d6'] },
  noData: '#e4e3df',
  highlight: '#0b0b0b',
};

const DARK: ChartTokens = {
  surface: '#1a1a19',
  text: '#f0efec',
  textSecondary: '#c3c2b7',
  textMuted: '#93928b',
  grid: '#2c2c2a',
  axis: '#4a4a46',
  border: '#1a1a19',
  categorical: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  sequential: ['#104281', '#184f95', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#cde2fb'],
  diverging: { neg: ['#e66767', '#8a4140'], mid: '#383835', pos: ['#2b4f7d', '#3987e5'] },
  noData: '#2f2f2c',
  highlight: '#f0efec',
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly prefersDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  readonly mode = signal<ThemeMode>(this.readStored() ?? (this.prefersDark ? 'dark' : 'light'));
  readonly tokens = computed(() => (this.mode() === 'dark' ? DARK : LIGHT));

  constructor() {
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.mode());
      try { localStorage.setItem('bi-theme', this.mode()); } catch { /* storage indisponível */ }
    });
  }

  toggle(): void {
    this.mode.update((m) => (m === 'dark' ? 'light' : 'dark'));
  }

  private readStored(): ThemeMode | null {
    try {
      const v = localStorage.getItem('bi-theme');
      return v === 'dark' || v === 'light' ? v : null;
    } catch {
      return null;
    }
  }

  /** Base comum de opções ECharts (tipografia, tooltip, animação). */
  base() {
    const t = this.tokens();
    return {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: t.textSecondary },
      animationDuration: 500,
      tooltip: {
        backgroundColor: t.surface,
        borderColor: t.axis,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.text, fontSize: 12 },
        extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,.12); border-radius: 8px;',
      },
    };
  }

  axis(extra: Record<string, unknown> = {}) {
    const t = this.tokens();
    return {
      axisLine: { lineStyle: { color: t.axis } },
      axisTick: { show: false },
      axisLabel: { color: t.textMuted, fontSize: 11 },
      splitLine: { lineStyle: { color: t.grid } },
      nameTextStyle: { color: t.textMuted, fontSize: 11 },
      ...extra,
    };
  }
}
