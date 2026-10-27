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

| Pergunta | Visual | Por quê |
|---|---|---|
| Como estamos? | KPIs + sparkline | Visão geral primeiro (Shneiderman) |
| Onde? | Coroplético por quintis + modal no hover | Distribuição assimétrica → classes por quantil |
| Quem lidera? | Barras horizontais ordenadas + mediana | Comparação de magnitude |
| Como evoluiu? | Linhas indexadas (base 100) / mediana + IQR | Culturas têm escalas diferentes → indexar |
| Por quê? | Dispersão + heatmap de correlação (divergente) | Diagnóstico de fatores |
| Quão desigual? | Boxplot por continente | Mostra distribuição, não só a média |
| Detalhe | Tabela ordenável + modal | Detalhes sob demanda |

Com "Todas" as culturas, a métrica é o **índice relativo** (100 = média mundial da cultura no ano), porque somar t/ha de batata e soja não faz sentido.

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
