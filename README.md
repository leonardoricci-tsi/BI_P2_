# Painel BI · Rendimento Agrícola Global

🔗 **Acesse o painel online:** https://dashboard-gules-ten-20.vercel.app

Painel de Business Intelligence (Angular 20 + ECharts) sobre rendimento de 10 culturas em 101 países (FAO / World Bank, 1990–2013).

## Arquitetura (pipeline de BI)

```
archive/*.csv ──► etl/build_dataset.py (pandas + geopandas) ──► esquema estrela ──► dashboard/public/data/*.json ──► Angular (DTOs → camada semântica → visuais)
```

1. **ETL** – `etl/build_dataset.py`
   - Limpeza: o `yield_df.csv` original tinha 15.112 linhas duplicadas (join com várias estações de temperatura) → consolidado em 13.130 observações.
   - Enriquecimento geográfico com **geopandas** + Natural Earth (ISO3, continente, sub-região, centróide). Bahrain e Mauritius (sem polígono em 1:110m) recebem coordenadas manuais e aparecem como ponto no mapa.
   - Modelo dimensional: `dim_pais`, `dim_cultura`, `dim_tempo`, `fato_producao` (país×cultura×ano) e `fato_clima` (país×ano). CSVs em `etl/output/`.
   - KPIs/insights globais (Spearman, CAGR, yield gap).
2. **DTOs** – `dashboard/src/app/models/dto.ts`: Raw DTO (contrato com o ETL) → Fato hidratado (relacionamentos resolvidos) → View DTOs (KPI, perfil de país, séries).
3. **Camada semântica** – `services/bi-data.service.ts`: medidas reativas (signals) recalculadas a cada filtro.

## Decisões de visualização

| Pergunta | Visual | Componente | Por quê |
|---|---|---|---|
| Como estamos? | KPIs + sparkline | `kpi-card.ts` | Visão geral primeiro (Shneiderman) |
| Onde? | Coroplético por quintis + modal no hover | `world-map.ts` | Distribuição assimétrica → classes por quantil |
| Quem lidera? | Barras horizontais ordenadas + mediana | `ranking-chart.ts` | Comparação de magnitude |
| Como evoluiu? | Linhas indexadas (base 100) / mediana + IQR | `trend-chart.ts` | Culturas têm escalas diferentes → indexar |
| Qual a composição? | Rosca (acima / na média / abaixo) | `performance-donut.ts` | Participação de cada faixa de desempenho |
| Que cultura cresceu? | Barras divergentes (variação %) | `crop-growth.ts` | Sinal positivo/negativo em torno do zero |
| Onde está a oportunidade? | Barras de progresso até o P90 | `crop-potential.ts` | Yield gap por cultura |
| O rendimento acompanha clima/insumos? | Dispersão (país × chuva / temperatura / pesticidas) | `climate-scatter.ts` | Relação entre duas variáveis numéricas |
| Qual fator pesa em cada cultura? | Heatmap de correlação (divergente −1…+1) | `correlation-heatmap.ts` | Diagnóstico de fatores por cultura |
| Quão desigual? | Boxplot por continente | `continent-boxplot.ts` | Mostra distribuição e atípicos, não só a média |
| Detalhe | Tabela ordenável + modal | `country-table.ts`, `country-modal.ts` | Detalhes sob demanda |
| Como os dados se ligam? | Diagrama do esquema estrela | `data-model.ts` | Documenta o modelo dentro do próprio painel |

Com "Todas" as culturas, a métrica é o **índice relativo** (100 = média mundial da cultura no ano), porque somar t/ha de batata e soja não faz sentido.

### Uso efetivo dos relacionamentos

- `fato_producao` → `dim_pais` / `dim_cultura` / `dim_tempo`: filtros de continente, país, cultura e período.
- `fato_producao` ↔ `fato_clima` pela chave conformada **(countryId, year)**: alimenta a dispersão, o heatmap de correlação, as colunas de chuva/temperatura/pesticidas da tabela e o modal do país.
- Todos os visuais são **filtragem cruzada**: clicar em um país, cultura, continente, fatia ou ano vira filtro global e recalcula KPIs e gráficos.

## Indicadores (KPIs)

| KPI | Fórmula | Por que usar |
|---|---|---|
| **Índice de rendimento** | `índice = rendimento(país, cultura, ano) ÷ média mundial(cultura, ano) × 100`; o KPI é a média do recorte | Compara culturas com escalas diferentes (100 = média mundial) |
| **Rendimento médio** (com 1 cultura) | `média(t/ha)` das observações país × ano do recorte | Produtividade absoluta da cultura |
| **Crescimento do rendimento** | `média(último triênio) ÷ média(primeiro triênio) − 1`, com t/ha rebaseado por cultura (1º ano = 100). Delta: `CAGR = (último ÷ primeiro)^(1/anos) − 1` | Mede ganho de produtividade no período |
| **Yield gap médio** | Para cada país × cultura no último triênio: `max(0, 1 − rendimento ÷ P90 da cultura)`; o KPI é a média | Distância até o que os 10% melhores já alcançam = potencial de ganho |
| **Volatilidade (CV)** | `desvio-padrão(série anual) ÷ média(série anual)` por país; o KPI é a média entre países | Risco / instabilidade da produção |
| **Países no recorte** / **Culturas do país** | Contagem distinta de países (ou de culturas, se um país estiver filtrado) | Tamanho da amostra por trás dos números |
| **ρ de Spearman** (dispersão e heatmap) | Correlação de Pearson aplicada aos *ranks* das duas variáveis (mínimo de 8 observações) | Robusta a outliers e a relações não lineares |

Todos os KPIs são recalculados em `services/bi-data.service.ts` sempre que um filtro muda.

## Divisão de responsabilidades

| Integrante | Responsabilidade |
|---|---|
| _Nome 1_ | Preparação dos dados e ETL (`etl/build_dataset.py`), modelo dimensional |
| _Nome 2_ | Camada semântica e KPIs (`bi-data.service.ts`), validação dos cálculos |
| _Nome 3_ | Visualizações e interatividade (componentes Angular / ECharts) |
| _Nome 4_ | Validação do painel, deploy na Vercel e apresentação final |

## Estrutura da apresentação final

1. **Problema e público** – que perguntas sobre rendimento agrícola o painel responde.
2. **Base de dados** – origem (FAO / World Bank), problemas encontrados (duplicatas, nomes de países) e limpeza feita no ETL.
3. **Modelo de dados** – esquema estrela, chaves e como `fato_clima` se liga a `fato_producao`.
4. **KPIs** – significado e fórmula de cada indicador.
5. **Demonstração ao vivo** – visão geral → mapa e ranking → evolução → fatores (dispersão + heatmap) → boxplot → tabela e perfil do país, usando os filtros e o clique cruzado.
6. **Validação** – como os números foram conferidos contra os dados de origem.
7. **Conclusão** – que decisões o painel apoia e próximos passos.

## Como rodar

```bash
python3 -m venv .venv && .venv/bin/pip install pandas geopandas pyogrio
.venv/bin/python etl/build_dataset.py      # regenera os JSON
cd dashboard && npm install && npm start   # http://localhost:4200
```

## Deploy

Hospedado na Vercel a partir da pasta `dashboard/` (configuração em `dashboard/vercel.json`):

```bash
cd dashboard && npx vercel deploy --prod
```
