# PGRScore // NFL Analytics

Protótipo web de análise da NFL com estética inspirada em jogos esportivos (EA Sports FC / Madden NFL).
O site mostra estatísticas reais da temporada mais recente da NFL, um índice próprio (**PGRScore**, 40–99),
e props over/under por jogador — tudo em HTML/CSS/JS puro, sem frameworks.

> Dados atuais: **temporada 2025** (fonte pública [nflverse](https://github.com/nflverse), sem login).

## Recursos

- **Head-to-Head** — compara dois times posição por posição, com os cards dos atletas lado a lado.
- **Equipes** — navegação com drill-down: time → posição → atleta, com modal de detalhes por jogador.
- **Gráficos** — desempenho de equipe (pontos/jogo casa vs fora, produção ofensiva) e evolução do jogador por partida.
- **Tema escuro refinado** com tint dinâmico: ao passar o mouse num time, a interface veste a cor dele.
- **Transições e microinterações** nos cliques (ripple, fade, cascata), com respeito a `prefers-reduced-motion`.
- **Responsivo** e acessível (navegação por teclado nos cards).

## Como rodar

O site é estático. Duas formas:

**1. Duplo-clique** (mais simples)
Abra `index.html` no navegador. Os dados já vêm embutidos em `data.js`.

**2. Servidor local** (recomendado para desenvolvimento)
```bash
python -m http.server 8000
# abra http://localhost:8000
```

## Estrutura

```
index.html            # marcação + estilos (CSS embutido)
app.js                # lógica do front-end (views, gráficos, interações)
data.js / data.json   # dados da temporada (gerados pelo pipeline)
pipeline_nflverse.py  # baixa e processa os dados da NFL (nflverse)
requirements.txt      # dependências opcionais do pipeline
```

## Atualizar os dados

O `pipeline_nflverse.py` baixa dados públicos do nflverse (sem login) e regenera `data.js`/`data.json`
no formato que o `app.js` consome.

```bash
python pipeline_nflverse.py                 # temporada 2025 (padrão)
python pipeline_nflverse.py --season 2024   # outra temporada
python pipeline_nflverse.py --season-type REG+POST   # inclui playoffs
python pipeline_nflverse.py --offline       # reutiliza CSVs já baixados
```

O script baixa automaticamente (via HTTPS):
- estatísticas de jogador por semana,
- rosters,
- jogos/agenda.

As estatísticas são oficiais (jardas, TDs, recepções, tackles, sacks, fantasy). O front detecta a
natureza dos dados via `meta.statMode` e ajusta props, gráficos e modal.

## Créditos

- Dados: [nflverse](https://github.com/nflverse) (licença aberta).
- Protótipo desenvolvido para hackathon (Estácio / AWS / NFL).

## Licença

Uso educacional / demonstração. Os dados da NFL pertencem às suas fontes originais (nflverse).
