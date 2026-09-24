#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PGRScore // pipeline de dados ATUAIS (nflverse)
===============================================
Gera `data.json` + `data.js` (formato consumido por app.js) a partir de dados
PUBLICOS e SEM LOGIN do projeto nflverse (https://github.com/nflverse).

Diferente do pipeline.py (tracking do Big Data Bowl, com velocidade/aceleracao),
este usa ESTATISTICAS REAIS da temporada mais recente disponivel (jardas, TDs,
recepcoes, tackles, sacks, etc.). E o caminho para ter dados atuais sem depender
de download manual do Kaggle.

Uso:
    python pipeline_nflverse.py                # baixa e processa a temporada padrao
    python pipeline_nflverse.py --season 2025  # escolhe a temporada
    python pipeline_nflverse.py --offline      # usa CSVs ja baixados em ./nflverse/

Fonte dos dados (nflverse), sob licenca aberta. Creditos ao nflverse.
"""

import argparse
import csv
import json
import os
import sys
import urllib.request

# ---------------------------------------------------------------------------
# Cores / conferencia / divisao / nome dos 32 times (constantes da liga).
# ---------------------------------------------------------------------------
TEAM_META = {
    "ARI": ("Arizona Cardinals",      "NFC", "West",  "#97233F", "#FFB612"),
    "ATL": ("Atlanta Falcons",        "NFC", "South", "#A71930", "#000000"),
    "BAL": ("Baltimore Ravens",       "AFC", "North", "#241773", "#9E7C0C"),
    "BUF": ("Buffalo Bills",          "AFC", "East",  "#00338D", "#C60C30"),
    "CAR": ("Carolina Panthers",      "NFC", "South", "#0085CA", "#101820"),
    "CHI": ("Chicago Bears",          "NFC", "North", "#0B162A", "#C83803"),
    "CIN": ("Cincinnati Bengals",     "AFC", "North", "#FB4F14", "#000000"),
    "CLE": ("Cleveland Browns",       "AFC", "North", "#311D00", "#FF3C00"),
    "DAL": ("Dallas Cowboys",         "NFC", "East",  "#003594", "#869397"),
    "DEN": ("Denver Broncos",         "AFC", "West",  "#FB4F14", "#002244"),
    "DET": ("Detroit Lions",          "NFC", "North", "#0076B6", "#B0B7BC"),
    "GB":  ("Green Bay Packers",      "NFC", "North", "#203731", "#FFB612"),
    "HOU": ("Houston Texans",         "AFC", "South", "#03202F", "#A71930"),
    "IND": ("Indianapolis Colts",     "AFC", "South", "#002C5F", "#A2AAAD"),
    "JAX": ("Jacksonville Jaguars",   "AFC", "South", "#101820", "#D7A22A"),
    "KC":  ("Kansas City Chiefs",     "AFC", "West",  "#E31837", "#FFB81C"),
    "LA":  ("Los Angeles Rams",       "NFC", "West",  "#003594", "#FFA300"),
    "LAC": ("Los Angeles Chargers",   "AFC", "West",  "#0080C6", "#FFC20E"),
    "LV":  ("Las Vegas Raiders",      "AFC", "West",  "#000000", "#A5ACAF"),
    "MIA": ("Miami Dolphins",         "AFC", "East",  "#008E97", "#FC4C02"),
    "MIN": ("Minnesota Vikings",      "NFC", "North", "#4F2683", "#FFC62F"),
    "NE":  ("New England Patriots",   "AFC", "East",  "#002244", "#C60C30"),
    "NO":  ("New Orleans Saints",     "NFC", "South", "#D3BC8D", "#101820"),
    "NYG": ("New York Giants",        "NFC", "East",  "#0B2265", "#A71930"),
    "NYJ": ("New York Jets",          "AFC", "East",  "#125740", "#000000"),
    "PHI": ("Philadelphia Eagles",    "NFC", "East",  "#004C54", "#A5ACAF"),
    "PIT": ("Pittsburgh Steelers",    "AFC", "North", "#FFB612", "#101820"),
    "SF":  ("San Francisco 49ers",    "NFC", "West",  "#AA0000", "#B3995D"),
    "SEA": ("Seattle Seahawks",       "NFC", "West",  "#002244", "#69BE28"),
    "TB":  ("Tampa Bay Buccaneers",   "NFC", "South", "#D50A0A", "#FF7900"),
    "TEN": ("Tennessee Titans",       "AFC", "South", "#0C2340", "#4B92DB"),
    "WAS": ("Washington Commanders",  "NFC", "East",  "#5A1414", "#FFB612"),
}

POSITION_GROUPS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB"]
GROUP_LABELS = {
    "QB": "Quarterbacks", "RB": "Running Backs", "WR": "Wide Receivers",
    "TE": "Tight Ends", "OL": "Linha Ofensiva", "DL": "Linha Defensiva",
    "LB": "Linebackers", "DB": "Defensive Backs",
}
POS_TO_GROUP = {
    "QB": "QB",
    "RB": "RB", "FB": "RB", "HB": "RB",
    "WR": "WR",
    "TE": "TE",
    "T": "OL", "G": "OL", "C": "OL", "OL": "OL", "OT": "OL", "OG": "OL", "LS": "OL",
    "DE": "DL", "DT": "DL", "NT": "DL", "DL": "DL", "EDGE": "DL",
    "OLB": "LB", "ILB": "LB", "MLB": "LB", "LB": "LB",
    "CB": "DB", "SS": "DB", "FS": "DB", "DB": "DB", "S": "DB",
}


def url_stats(season):
    return ("https://github.com/nflverse/nflverse-data/releases/download/"
            "stats_player/stats_player_week_%d.csv" % season)

def url_roster(season):
    return ("https://github.com/nflverse/nflverse-data/releases/download/"
            "rosters/roster_%d.csv" % season)

URL_GAMES = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"


def to_float(v):
    try:
        if v in (None, "", "NA"):
            return None
        return float(v)
    except (ValueError, TypeError):
        return None

def to_int(v):
    f = to_float(v)
    return int(f) if f is not None else None

def num(v):
    """float ou 0.0 (para somar)."""
    f = to_float(v)
    return f if f is not None else 0.0


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
        f.write(r.read())


def ensure_files(season, data_dir, offline):
    os.makedirs(data_dir, exist_ok=True)
    files = {
        "stats": (url_stats(season), os.path.join(data_dir, "stats_week_%d.csv" % season)),
        "roster": (url_roster(season), os.path.join(data_dir, "roster_%d.csv" % season)),
        "games": (URL_GAMES, os.path.join(data_dir, "games.csv")),
    }
    for key, (url, dest) in files.items():
        if offline:
            if not os.path.exists(dest):
                sys.exit("ERRO (offline): faltando %s" % dest)
            continue
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            print("  cache: %s" % os.path.basename(dest))
            continue
        print("  baixando %s ..." % os.path.basename(dest))
        try:
            download(url, dest)
        except Exception as e:
            sys.exit("ERRO ao baixar %s\n  %s\n  %s" % (url, type(e).__name__, e))
    return {k: v[1] for k, v in files.items()}


def read_csv(path):
    with open(path, encoding="utf-8", errors="replace", newline="") as f:
        return list(csv.DictReader(f))


def parse_height(v):
    if not v:
        return None
    v = str(v).strip()
    if "-" in v:
        ft, inch = (v.split("-") + ["0"])[:2]
        fi, ii = to_int(ft), to_int(inch)
        return (fi * 12 + ii) if (fi is not None and ii is not None) else None
    f = to_float(v)
    return int(f) if f else None


# props reais por grupo de posicao (linha = valor - margem, pra virar over/under)
def build_props(grp, s):
    def prop(key, label, actual, unit, margin):
        actual = round(actual, 1)
        return {"key": key, "label": label,
                "line": round(actual - margin, 1), "actual": actual, "unit": unit}
    if grp == "QB":
        return [
            prop("pass_yds", "Jardas de Passe", s["passing_yards"], "yd", max(8, s["passing_yards"] * 0.04)),
            prop("pass_td", "TDs de Passe", s["passing_tds"], "", 0.5),
            prop("rush_yds", "Jardas Corridas", s["rushing_yards"], "yd", max(4, s["rushing_yards"] * 0.05)),
        ]
    if grp == "RB":
        return [
            prop("rush_yds", "Jardas Corridas", s["rushing_yards"], "yd", max(6, s["rushing_yards"] * 0.05)),
            prop("rush_td", "TDs Corridos", s["rushing_tds"], "", 0.5),
            prop("rec_yds", "Jardas Recebidas", s["receiving_yards"], "yd", max(4, s["receiving_yards"] * 0.06)),
        ]
    if grp in ("WR", "TE"):
        return [
            prop("rec_yds", "Jardas Recebidas", s["receiving_yards"], "yd", max(6, s["receiving_yards"] * 0.05)),
            prop("rec", "Recepcoes", s["receptions"], "", max(1, s["receptions"] * 0.08)),
            prop("rec_td", "TDs Recebidos", s["receiving_tds"], "", 0.5),
        ]
    if grp in ("DL", "LB", "DB"):
        return [
            prop("tackles", "Tackles (solo)", s["def_tackles_solo"], "", max(2, s["def_tackles_solo"] * 0.06)),
            prop("sacks", "Sacks", s["def_sacks"], "", 0.5),
            prop("ints", "Interceptacoes", s["def_ints"], "", 0.5),
        ]
    # OL nao tem stats individuais no dataset -> props genericas
    return [
        prop("games", "Jogos disputados", s["games"], "", 0.5),
    ]


def pgr_score(grp, s):
    """Indice proprio 40-99 a partir de producao real (normalizada por grupo)."""
    fp = s["fantasy_ppr"]
    # teto de fantasy tipico por grupo p/ normalizar em ~0..1
    ceil = {"QB": 380, "RB": 300, "WR": 300, "TE": 200,
            "DL": 90, "LB": 130, "DB": 120, "OL": 17}.get(grp, 200)
    base = min(fp / ceil, 1.0) if ceil else 0.4
    vol = min(s["games"] / 17.0, 1.0)          # participacao
    raw = 0.72 * base + 0.28 * vol
    return int(round(40 + raw * 59))


def main():
    ap = argparse.ArgumentParser(description="Gera data.json/data.js do PGRScore a partir do nflverse.")
    ap.add_argument("--season", type=int, default=2025, help="temporada (default: 2025)")
    ap.add_argument("--data-dir", default="nflverse", help="pasta de cache dos CSVs")
    ap.add_argument("--offline", action="store_true", help="usa CSVs ja baixados")
    ap.add_argument("--season-type", default="REG", choices=["REG", "REG+POST"],
                    help="usar so temporada regular (REG) ou incluir playoffs")
    args = ap.parse_args()

    base = os.path.dirname(os.path.abspath(__file__))
    print("Preparando dados da temporada %d (nflverse)..." % args.season)
    paths = ensure_files(args.season, os.path.join(base, args.data_dir), args.offline)

    print("Lendo CSVs...")
    stats_rows = read_csv(paths["stats"])
    roster_rows = read_csv(paths["roster"])
    games_rows = read_csv(paths["games"])

    include_post = (args.season_type == "REG+POST")

    # --- roster: player_id -> metadados -------------------------------------
    pmeta = {}
    for r in roster_rows:
        pid = r.get("gsis_id") or r.get("player_id")
        if not pid:
            continue
        pos = (r.get("position") or "").strip().upper()
        pmeta[pid] = {
            "name": (r.get("full_name") or "").strip(),
            "position": pos,
            "group": POS_TO_GROUP.get(pos),
            "jersey": to_int(r.get("jersey_number")),
            "heightIn": parse_height(r.get("height")),
            "weight": to_float(r.get("weight")),
            "college": ((r.get("college") or "NA").split(";")[0].strip() or "NA"),
            "team": (r.get("team") or "").strip(),
        }

    # --- games: standings + casa/fora ---------------------------------------
    game_info = {}
    weeks_seen = set()
    for g in games_rows:
        if to_int(g.get("season")) != args.season:
            continue
        gt = (g.get("game_type") or "").strip()
        is_reg = (gt == "REG")
        if not is_reg and not include_post:
            continue
        hs = to_int(g.get("home_score")); as_ = to_int(g.get("away_score"))
        wk = to_int(g.get("week"))
        gid = g.get("game_id")
        game_info[gid] = {
            "home": g.get("home_team"), "away": g.get("away_team"),
            "week": wk, "home_score": hs, "away_score": as_, "reg": is_reg,
        }
        if wk is not None:
            weeks_seen.add(wk)

    week_min = min(weeks_seen) if weeks_seen else 1
    week_max = max(weeks_seen) if weeks_seen else 1

    # --- times base ---------------------------------------------------------
    teams = {}
    for abbr, (name, conf, div, c1, c2) in TEAM_META.items():
        teams[abbr] = {
            "abbr": abbr, "name": name, "conf": conf, "div": div,
            "colors": {"primary": c1, "secondary": c2},
            "groups": {g: [] for g in POSITION_GROUPS},
            "_rec": {"w": 0, "l": 0, "t": 0},
            "_split": {"home": {"g": set(), "pts": 0, "yds": 0.0},
                       "away": {"g": set(), "pts": 0, "yds": 0.0}},
        }

    # standings a partir dos jogos
    for gid, gi in game_info.items():
        if not gi["reg"]:
            continue
        h, a = gi["home"], gi["away"]
        hs, as_ = gi["home_score"], gi["away_score"]
        if h not in teams or a not in teams or hs is None or as_ is None:
            continue
        if hs > as_:
            teams[h]["_rec"]["w"] += 1; teams[a]["_rec"]["l"] += 1
        elif as_ > hs:
            teams[a]["_rec"]["w"] += 1; teams[h]["_rec"]["l"] += 1
        else:
            teams[h]["_rec"]["t"] += 1; teams[a]["_rec"]["t"] += 1
        teams[h]["_split"]["home"]["g"].add(gid); teams[h]["_split"]["home"]["pts"] += hs or 0
        teams[a]["_split"]["away"]["g"].add(gid); teams[a]["_split"]["away"]["pts"] += as_ or 0

    # --- agrega stats por jogador (temporada) -------------------------------
    agg = {}  # pid -> acumulado

    def blank(team):
        return {"team": team, "games": 0,
                "passing_yards": 0.0, "passing_tds": 0.0, "attempts": 0.0, "completions": 0.0,
                "rushing_yards": 0.0, "rushing_tds": 0.0, "carries": 0.0,
                "receiving_yards": 0.0, "receiving_tds": 0.0, "receptions": 0.0, "targets": 0.0,
                "def_tackles_solo": 0.0, "def_sacks": 0.0, "def_ints": 0.0,
                "fantasy_ppr": 0.0, "perGame": []}

    for row in stats_rows:
        if to_int(row.get("season")) != args.season:
            continue
        st = (row.get("season_type") or "").strip()
        if st != "REG" and not include_post:
            continue
        pid = row.get("player_id")
        if not pid:
            continue
        team = (row.get("team") or "").strip()
        if pid not in agg:
            agg[pid] = blank(team)
        A = agg[pid]
        A["team"] = team or A["team"]
        A["games"] += 1
        A["passing_yards"] += num(row.get("passing_yards"))
        A["passing_tds"] += num(row.get("passing_tds"))
        A["attempts"] += num(row.get("attempts"))
        A["completions"] += num(row.get("completions"))
        A["rushing_yards"] += num(row.get("rushing_yards"))
        A["rushing_tds"] += num(row.get("rushing_tds"))
        A["carries"] += num(row.get("carries"))
        A["receiving_yards"] += num(row.get("receiving_yards"))
        A["receiving_tds"] += num(row.get("receiving_tds"))
        A["receptions"] += num(row.get("receptions"))
        A["targets"] += num(row.get("targets"))
        A["def_tackles_solo"] += num(row.get("def_tackles_solo"))
        A["def_sacks"] += num(row.get("def_sacks"))
        A["def_ints"] += num(row.get("def_interceptions"))
        A["fantasy_ppr"] += num(row.get("fantasy_points_ppr"))
        # serie por jogo
        wk = to_int(row.get("week"))
        opp = (row.get("opponent_team") or "").strip()
        A["perGame"].append({
            "week": wk, "opp": opp,
            "pass_yds": round(num(row.get("passing_yards")), 1),
            "rush_yds": round(num(row.get("rushing_yards")), 1),
            "rec_yds": round(num(row.get("receiving_yards")), 1),
            "fantasy": round(num(row.get("fantasy_points_ppr")), 1),
        })

    # --- monta jogadores por time -------------------------------------------
    METRIC_BY_GROUP = {
        "QB": ("pass_yds", "Jardas de passe"),
        "RB": ("rush_yds", "Jardas corridas"),
        "WR": ("rec_yds", "Jardas recebidas"),
        "TE": ("rec_yds", "Jardas recebidas"),
        "DL": ("fantasy", "Pontos (PPR)"),
        "LB": ("fantasy", "Pontos (PPR)"),
        "DB": ("fantasy", "Pontos (PPR)"),
        "OL": ("fantasy", "Pontos (PPR)"),
    }

    for pid, A in agg.items():
        meta = pmeta.get(pid)
        grp = meta["group"] if meta else None
        team = (meta["team"] if meta and meta.get("team") else A["team"])
        if not grp or team not in teams:
            continue
        if A["games"] == 0:
            continue

        metric_key, metric_label = METRIC_BY_GROUP.get(grp, ("fantasy", "Pontos (PPR)"))
        per_game = []
        for pg in sorted(A["perGame"], key=lambda x: (x["week"] or 0)):
            gi_side = None
            per_game.append({
                "week": pg["week"], "opp": pg["opp"], "side": "",
                # chaves reais (o grafico de jogador seleciona uma delas)
                "pass_yds": pg.get("pass_yds", 0),
                "rush_yds": pg.get("rush_yds", 0),
                "rec_yds": pg.get("rec_yds", 0),
                "fantasy": pg.get("fantasy", 0),
                # metrica principal da posicao (default do grafico)
                "metric": pg.get(metric_key, 0),
                "metricLabel": metric_label,
                "value": pg.get(metric_key, 0),
            })

        stat = {
            "games": A["games"],
            "passing_yards": A["passing_yards"], "passing_tds": A["passing_tds"],
            "rushing_yards": A["rushing_yards"], "rushing_tds": A["rushing_tds"],
            "receiving_yards": A["receiving_yards"], "receiving_tds": A["receiving_tds"],
            "receptions": A["receptions"], "targets": A["targets"],
            "def_tackles_solo": A["def_tackles_solo"], "def_sacks": A["def_sacks"],
            "def_ints": A["def_ints"], "fantasy_ppr": A["fantasy_ppr"],
        }
        score = pgr_score(grp, stat)

        player = {
            "nflId": pid, "name": meta["name"], "position": meta["position"],
            "group": grp, "jersey": meta["jersey"],
            "heightIn": meta["heightIn"], "weight": meta["weight"],
            "college": meta["college"],
            "snaps": int(A["games"]),          # "snaps" reaproveitado como jogos disputados
            "pgrScore": score,
            "topSpeedMph": None,                # sem tracking nesta fonte
            "hasTracking": False,
            "metricKey": metric_key, "metricLabel": metric_label,
            "props": build_props(grp, stat),
            "perGame": per_game,
            # totais para o modal
            "totals": {
                "Jardas passe": int(A["passing_yards"]), "TDs passe": int(A["passing_tds"]),
                "Jardas corrida": int(A["rushing_yards"]), "TDs corrida": int(A["rushing_tds"]),
                "Recepcoes": int(A["receptions"]), "Jardas recebidas": int(A["receiving_yards"]),
                "TDs recebidos": int(A["receiving_tds"]),
                "Tackles solo": int(A["def_tackles_solo"]), "Sacks": round(A["def_sacks"], 1),
                "INTs": int(A["def_ints"]), "Fantasy PPR": round(A["fantasy_ppr"], 1),
            },
        }
        teams[team]["groups"][grp].append(player)

    # ordena grupos por pgrScore
    for abbr, t in teams.items():
        for g in POSITION_GROUPS:
            t["groups"][g].sort(key=lambda p: p["pgrScore"], reverse=True)

    # --- standings finais ---------------------------------------------------
    def win_pct(rec):
        tot = rec["w"] + rec["l"] + rec["t"]
        return (rec["w"] + 0.5 * rec["t"]) / tot if tot else 0.0

    order = sorted(teams.values(),
                   key=lambda t: (win_pct(t["_rec"]), t["_rec"]["w"]), reverse=True)
    standings = []
    for i, t in enumerate(order, start=1):
        rec = t["_rec"]
        record = "%d-%d%s" % (rec["w"], rec["l"], ("-%d" % rec["t"]) if rec["t"] else "")
        t["rank"] = i
        t["record"] = record
        t["winPct"] = round(win_pct(rec), 3)
        t["rosterCount"] = sum(len(t["groups"][g]) for g in POSITION_GROUPS)
        standings.append({"rank": i, "abbr": t["abbr"], "name": t["name"],
                          "record": record, "conf": t["conf"], "div": t["div"]})

    # split casa/fora (pontos medios por jogo)
    for abbr, t in teams.items():
        out = {}
        for side in ("home", "away"):
            sp = t["_split"][side]
            gc = len(sp["g"])
            out[side] = {
                "games": gc,
                "avgDistPerSnap": round(sp["pts"] / gc, 1) if gc else 0.0,  # pontos/jogo
                "topSpeedMph": 0.0,
            }
        t["splitHomeAway"] = out
        for k in ("_rec", "_split"):
            t.pop(k, None)

    total_players = sum(t["rosterCount"] for t in teams.values())
    scope = "regular" if not include_post else "regular + playoffs"
    meta = {
        "source": "nflverse · NFL %d (%s)" % (args.season, scope),
        "gamesProcessed": len(game_info),
        "playersRegistered": total_players,
        "playersInRosters": total_players,
        "weekMin": week_min, "weekMax": week_max,
        "coverage": "Temporada %d · %d jogos · stats oficiais (nflverse)" % (args.season, len(game_info)),
        "note": "Estatisticas reais por jogo (nflverse). PGRScore e indice proprio derivado de producao.",
        "positionGroups": POSITION_GROUPS,
        "groupLabels": GROUP_LABELS,
        "season": args.season,
        "statMode": "real",         # sinaliza ao front que sao stats reais (nao tracking)
    }

    out = {"meta": meta, "standings": standings, "teams": teams}

    jpath = os.path.join(base, "data.json")
    with open(jpath, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    dpath = os.path.join(base, "data.js")
    with open(dpath, "w", encoding="utf-8") as f:
        f.write("// Gerado por pipeline_nflverse.py - dados reais da temporada %d (nflverse)\n" % args.season)
        f.write("window.PGRSCORE_DATA = ")
        json.dump(out, f, ensure_ascii=False)
        f.write(";\n")

    print("\nOK!")
    print("  data.json -> %.1f KB" % (os.path.getsize(jpath) / 1024))
    print("  data.js   -> %.1f KB" % (os.path.getsize(dpath) / 1024))
    print("  temporada %d · semanas %d-%d · %d jogadores em elenco"
          % (args.season, week_min, week_max, total_players))
    print("  fonte: nflverse (dados publicos)")
    print("\nAbra index.html (duplo-clique) para ver os dados atualizados.")


if __name__ == "__main__":
    main()
