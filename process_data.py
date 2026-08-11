"""
Process Cricsheet ball-by-ball data for The Hundred to build
a score prediction model.

Downloads hnd_json.zip, parses every innings, and for each
(balls_bowled, wickets_lost) state computes the median additional
runs scored to end of innings. Outputs model_mens.json and
model_womens.json.
"""

import json
import os
import sys
import zipfile
import urllib.request
import statistics
import math
from collections import defaultdict

DATA_URL = "https://cricsheet.org/downloads/hnd_json.zip"
ZIP_PATH = "hnd_json.zip"
EXTRACT_DIR = "hnd_json"
MAX_BALLS = 100
MAX_WICKETS = 10


def download_data():
    """Download the Cricsheet zip with browser User-Agent to prevent 403 Forbidden blocks."""
    if os.path.exists(ZIP_PATH):
        os.remove(ZIP_PATH)
        
    print(f"  Downloading {DATA_URL} ...")
    req = urllib.request.Request(
        DATA_URL,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'}
    )
    with urllib.request.urlopen(req) as response, open(ZIP_PATH, 'wb') as out_file:
        out_file.write(response.read())
    print(f"  Downloaded {ZIP_PATH}")


def extract_data():
    """Extract the downloaded zip file."""
    if os.path.exists(EXTRACT_DIR):
        import shutil
        shutil.rmtree(EXTRACT_DIR)
        
    print(f"  Extracting {ZIP_PATH} ...")
    with zipfile.ZipFile(ZIP_PATH, 'r') as z:
        z.extractall(EXTRACT_DIR)
    print(f"  Extracted to {EXTRACT_DIR}/")


def parse_innings(match_data):
    """
    Parse a single match JSON and yield innings data.
    
    Each yielded item is a dict:
      {
        'gender': 'male' | 'female',
        'balls_runs_wickets': [(ball_number, cumulative_runs, cumulative_wickets), ...],
        'final_runs': int,
        'team': str,
        'date': str
      }
    """
    info = match_data.get("info", {})
    gender = info.get("gender", "unknown")
    balls_per_over = info.get("balls_per_over", 5)  # The Hundred uses 5-ball sets
    dates = info.get("dates", [])
    date_str = dates[0] if dates else "unknown"
    venue = info.get("venue", "Unknown")
    teams = info.get("teams", [])

    parsed_innings = []
    for idx, inning in enumerate(match_data.get("innings", [])):
        batting_team = inning.get("team", "unknown")
        bowling_team = "unknown"
        for t in teams:
            if t != batting_team:
                bowling_team = t
                break
        
        overs = inning.get("overs", [])

        cumulative_runs = 0
        cumulative_wickets = 0
        ball_number = 0
        ball_states = []

        ball_states.append((0, 0, 0))

        for over_data in overs:
            deliveries = over_data.get("deliveries", [])
            for delivery in deliveries:
                runs = delivery.get("runs", {})
                cumulative_runs += runs.get("total", 0)

                wickets = delivery.get("wickets", [])
                for w in wickets:
                    if w.get("kind", "") not in ("retired hurt", "retired not out"):
                        cumulative_wickets += 1

                extras = delivery.get("extras", {})
                if not ("wides" in extras or "noballs" in extras):
                    ball_number += 1

                ball_states.append((ball_number, cumulative_runs, cumulative_wickets))

        if ball_number > 0:
            parsed_innings.append({
                "gender": gender,
                "ball_states": ball_states,
                "final_runs": cumulative_runs,
                "final_balls": ball_number,
                "final_wickets": cumulative_wickets,
                "batting_team": batting_team,
                "bowling_team": bowling_team,
                "date": date_str,
                "venue": venue,
                "innings_number": idx + 1,
            })

    if parsed_innings:
        # If the 1st innings didn't reach 100 balls AND wasn't bowled out (10 wickets),
        # the match was likely shortened by rain. We drop the entire match to avoid skewed data.
        first = parsed_innings[0]
        if first["final_balls"] < 100 and first["final_wickets"] < 10:
            return []

    return parsed_innings

from collections import defaultdict

def calculate_team_ratings(innings_list):
    """
    Calculate statistical strength multipliers for batting and bowling.
    Batting > 1.0 means they score more than average.
    Bowling < 1.0 means they concede fewer runs than average (good).
    """
    # Filter for 2026 season
    current_season_innings = [i for i in innings_list if i.get("date", "").startswith("2026")]
    
    # Fallback to all-time if no 2026 data exists yet
    if len(current_season_innings) == 0:
        current_season_innings = innings_list

    if not current_season_innings:
        return {}
        
    avg_score = sum(i["final_runs"] for i in current_season_innings) / len(current_season_innings)
    
    team_runs_scored = defaultdict(list)
    team_runs_conceded = defaultdict(list)
    
    for i in current_season_innings:
        team_runs_scored[i["batting_team"]].append(i["final_runs"])
        team_runs_conceded[i["bowling_team"]].append(i["final_runs"])
        
    ratings = {}
    all_teams = set(list(team_runs_scored.keys()) + list(team_runs_conceded.keys()))
    
    # Bayesian prior weight (m=5 innings) to prevent single-game sample size distortions early in 2026
    m = 5.0
    for team in all_teams:
        scored = team_runs_scored[team]
        conceded = team_runs_conceded[team]
        
        n_bat = len(scored)
        n_bowl = len(conceded)
        
        sum_scored = sum(scored) if n_bat > 0 else 0
        sum_conceded = sum(conceded) if n_bowl > 0 else 0
        
        # Smooth ratings toward 1.0 based on sample size
        bat_rating = (sum_scored + m * avg_score) / ((n_bat + m) * avg_score) if avg_score > 0 else 1.0
        bowl_rating = (sum_conceded + m * avg_score) / ((n_bowl + m) * avg_score) if avg_score > 0 else 1.0
        
        ratings[team] = {
            "batting": round(bat_rating, 3),
            "bowling": round(bowl_rating, 3),
            "innings_batted": n_bat,
            "innings_bowled": n_bowl
        }
        
    return ratings
def build_model(innings_list):
    """
    Build prediction lookup table from processed innings.
    
    For each (ball, wicket) state, collect additional runs scored
    from that point to end of innings. Compute median, mean,
    percentiles for the model.
    """
    # additional_runs[ball][wicket] = list of additional runs values
    additional_runs = defaultdict(lambda: defaultdict(list))
    # Also track run rates for projected curves
    run_rate_by_ball = defaultdict(list)

    for innings in innings_list:
        final_runs = innings["final_runs"]
        final_balls = innings["final_balls"]
        ball_states = innings["ball_states"]

        # Build a lookup: for each ball number, what was the state?
        # We want the state AFTER each ball. Handle duplicates
        # (extras can cause multiple entries per ball number) by
        # taking the last one.
        state_at_ball = {}
        for ball, runs, wickets in ball_states:
            state_at_ball[ball] = (runs, wickets)

        # For each ball from 0 to final_balls, record additional runs
        for ball in range(min(final_balls, MAX_BALLS) + 1):
            if ball in state_at_ball:
                runs_at_ball, wickets_at_ball = state_at_ball[ball]
                remaining = final_runs - runs_at_ball
                if wickets_at_ball <= MAX_WICKETS:
                    additional_runs[ball][wickets_at_ball].append(remaining)

        # Track run rates at each ball for curve projection
        for ball in range(1, min(final_balls, MAX_BALLS) + 1):
            if ball in state_at_ball:
                runs_at_ball, _ = state_at_ball[ball]
                run_rate_by_ball[ball].append(runs_at_ball)

    # Compute statistics for each cell
    model = {
        "additional_runs_median": {},
        "additional_runs_mean": {},
        "additional_runs_p25": {},
        "additional_runs_p75": {},
        "additional_runs_min": {},
        "additional_runs_max": {},
        "sample_counts": {},
        "avg_cumulative_runs": {},
    }

    for ball in range(MAX_BALLS + 1):
        ball_key = str(ball)
        model["additional_runs_median"][ball_key] = {}
        model["additional_runs_mean"][ball_key] = {}
        model["additional_runs_p25"][ball_key] = {}
        model["additional_runs_p75"][ball_key] = {}
        model["additional_runs_min"][ball_key] = {}
        model["additional_runs_max"][ball_key] = {}
        model["sample_counts"][ball_key] = {}

        for wicket in range(MAX_WICKETS + 1):
            wkt_key = str(wicket)
            values = additional_runs[ball][wicket]
            if values:
                sorted_vals = sorted(values)
                n = len(sorted_vals)
                model["additional_runs_median"][ball_key][wkt_key] = round(statistics.median(sorted_vals), 1)
                model["additional_runs_mean"][ball_key][wkt_key] = round(statistics.mean(sorted_vals), 1)
                model["additional_runs_p25"][ball_key][wkt_key] = round(sorted_vals[max(0, n // 4 - 1)], 1)
                model["additional_runs_p75"][ball_key][wkt_key] = round(sorted_vals[min(n - 1, 3 * n // 4)], 1)
                model["additional_runs_min"][ball_key][wkt_key] = sorted_vals[0]
                model["additional_runs_max"][ball_key][wkt_key] = sorted_vals[-1]
                model["sample_counts"][ball_key][wkt_key] = n
            else:
                model["additional_runs_median"][ball_key][wkt_key] = None
                model["additional_runs_mean"][ball_key][wkt_key] = None
                model["additional_runs_p25"][ball_key][wkt_key] = None
                model["additional_runs_p75"][ball_key][wkt_key] = None
                model["additional_runs_min"][ball_key][wkt_key] = None
                model["additional_runs_max"][ball_key][wkt_key] = None
                model["sample_counts"][ball_key][wkt_key] = 0

    # Average cumulative runs at each ball (for projected curve baseline)
    for ball in range(MAX_BALLS + 1):
        ball_key = str(ball)
        if ball in run_rate_by_ball and run_rate_by_ball[ball]:
            model["avg_cumulative_runs"][ball_key] = round(statistics.mean(run_rate_by_ball[ball]), 1)
        else:
            model["avg_cumulative_runs"][ball_key] = None

    return model


WICKET_RESOURCE_TABLE = [1.00, 0.93, 0.85, 0.75, 0.63, 0.50, 0.37, 0.25, 0.15, 0.07, 0.00]

def calculate_dls_baseline(ball, wicket, base_score):
    balls_remaining = max(0, MAX_BALLS - ball)
    ball_fraction = balls_remaining / 100.0
    wkt_factor = WICKET_RESOURCE_TABLE[wicket] if wicket < len(WICKET_RESOURCE_TABLE) else 0.0
    return base_score * (ball_fraction ** 0.92) * wkt_factor

def smooth_model(model, initial_avg_score=135.0):
    """
    1. Blend small-sample & missing cells with DLS cricket resource decay model.
    2. Enforce directional isotonic monotonicity across balls and wickets.
    """
    counts = model.get("sample_counts", {})
    
    for metric in ["additional_runs_median", "additional_runs_mean",
                    "additional_runs_p25", "additional_runs_p75"]:
        data = model.get(metric)
        if not data:
            continue

        # First pass: DLS Resource Decay blending for small-sample/missing cells
        for ball in range(MAX_BALLS + 1):
            ball_key = str(ball)
            for wicket in range(MAX_WICKETS + 1):
                wkt_key = str(wicket)
                n = counts.get(ball_key, {}).get(wkt_key, 0)
                dls_val = calculate_dls_baseline(ball, wicket, initial_avg_score)
                
                raw_val = data[ball_key].get(wkt_key)
                if raw_val is None or n < 15:
                    emp = raw_val if raw_val is not None else dls_val
                    weight = n / 15.0
                    blended = (emp * weight) + (dls_val * (1.0 - weight))
                    data[ball_key][wkt_key] = round(blended, 1)

        # Second pass: Wicket Monotonicity (higher wickets lost MUST NOT exceed lower wickets lost)
        for ball in range(MAX_BALLS + 1):
            b_key = str(ball)
            for wicket in range(1, MAX_WICKETS + 1):
                w_key = str(wicket)
                w_prev_key = str(wicket - 1)
                if data[b_key][w_key] > data[b_key][w_prev_key]:
                    data[b_key][w_key] = data[b_key][w_prev_key]

        # Third pass: Ball Monotonicity (earlier balls MUST have >= remaining runs than later balls)
        for wicket in range(MAX_WICKETS + 1):
            w_key = str(wicket)
            for ball in range(MAX_BALLS - 1, -1, -1):
                b_key = str(ball)
                b_next_key = str(ball + 1)
                if data[b_key][w_key] < data[b_next_key][w_key]:
                    data[b_key][w_key] = data[b_next_key][w_key]

    return model


def build_full_dataset(innings_list, gender):
    scores = [i["final_runs"] for i in innings_list]
    avg_score = statistics.mean(scores) if scores else 135.0

    overall_model = build_model(innings_list)
    overall_model = smooth_model(overall_model, avg_score)
    
    # Calculate overall summary
    scores = [i["final_runs"] for i in innings_list]
    overall_model["summary"] = {
        "avg_score": round(statistics.mean(scores), 1),
        "median_score": round(statistics.median(scores), 1),
        "min_score": min(scores),
        "max_score": max(scores),
        "std_dev": round(statistics.stdev(scores), 1) if len(scores) > 1 else 0,
    }
    
    # Calculate overall meta
    overall_model["meta"] = {
        "competition": "The Hundred",
        "gender": gender,
        "innings_count": len(innings_list),
        "match_count": len(set(i["date"] + i["batting_team"] for i in innings_list)),
        "date_range": f"{min(i['date'] for i in innings_list)} to {max(i['date'] for i in innings_list)}" if innings_list else "",
        "max_balls": MAX_BALLS,
        "max_wickets": MAX_WICKETS,
    }

    venues = defaultdict(list)
    for innings in innings_list:
        venues[innings["venue"]].append(innings)
        
    venue_models = {}
    for venue, v_innings in venues.items():
        if len(v_innings) < 10:  # Skip venues with very few innings to avoid extreme noise
            continue
        v_scores = [i["final_runs"] for i in v_innings]
        v_avg = statistics.mean(v_scores) if v_scores else avg_score
        v_model = build_model(v_innings)
        v_model = smooth_model(v_model, v_avg)
        v_model["summary"] = {
            "avg_score": round(statistics.mean(v_scores), 1),
            "median_score": round(statistics.median(v_scores), 1),
            "min_score": min(v_scores),
            "max_score": max(v_scores),
            "std_dev": round(statistics.stdev(v_scores), 1) if len(v_scores) > 1 else 0,
        }
        
        v_model["meta"] = {
            "venue": venue,
            "innings_count": len(v_innings)
        }
        venue_models[venue] = v_model

    team_ratings = calculate_team_ratings(innings_list)

    return {
        "overall": overall_model,
        "venues": venue_models,
        "team_ratings": team_ratings
    }


def main():
    print("=== The Hundred Score Prediction Model Builder ===\n")

    # Step 1: Download data
    print("Step 1: Download data")
    download_data()

    # Step 2: Extract data
    print("\nStep 2: Extract data")
    extract_data()

    # Step 3: Parse all matches
    print("\nStep 3: Parse matches")
    mens_1 = []
    mens_2 = []
    womens_1 = []
    womens_2 = []
    match_count = 0
    error_count = 0

    json_dir = EXTRACT_DIR
    # Find JSON files (they might be in subdirectories)
    json_files = []
    for root, dirs, files in os.walk(json_dir):
        for f in files:
            if f.endswith(".json"):
                json_files.append(os.path.join(root, f))

    print(f"  Found {len(json_files)} JSON files")

    for filepath in sorted(json_files):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                match_data = json.load(f)

            match_count += 1
            for innings in parse_innings(match_data):
                if innings["gender"] == "male":
                    if innings["innings_number"] == 1:
                        mens_1.append(innings)
                    elif innings["innings_number"] == 2:
                        mens_2.append(innings)
                elif innings["gender"] == "female":
                    if innings["innings_number"] == 1:
                        womens_1.append(innings)
                    elif innings["innings_number"] == 2:
                        womens_2.append(innings)
        except Exception as e:
            error_count += 1
            print(f"  Error parsing {filepath}: {e}")

    print(f"  Parsed {match_count} matches ({error_count} errors)")
    print(f"  Men's 1st innings: {len(mens_1)}, 2nd innings: {len(mens_2)}")
    print(f"  Women's 1st innings: {len(womens_1)}, 2nd innings: {len(womens_2)}")

    # Step 4: Build models
    print("\nStep 4: Build prediction models")

    print("  Building men's models...")
    mens_full = {
        "1": build_full_dataset(mens_1, "men (1st)"),
        "2": build_full_dataset(mens_2, "men (2nd)")
    }

    print("  Building women's models...")
    womens_full = {
        "1": build_full_dataset(womens_1, "women (1st)"),
        "2": build_full_dataset(womens_2, "women (2nd)")
    }

    # Step 5: Save models
    print("\nStep 5: Save models")

    with open("public/model_mens.json", "w") as f:
        json.dump(mens_full, f)
    print(f"  Saved public/model_mens.json")

    with open("public/model_womens.json", "w") as f:
        json.dump(womens_full, f)
    print(f"  Saved public/model_womens.json")

    # Print summary
    print("\n=== Summary ===")
    print(f"Men's 1st: {len(mens_1)} innings, avg score: {mens_full['1']['overall']['summary']['avg_score']}, "
          f"range: {mens_full['1']['overall']['summary']['min_score']}-{mens_full['1']['overall']['summary']['max_score']}")
    print(f"Men's 2nd: {len(mens_2)} innings, avg score: {mens_full['2']['overall']['summary']['avg_score']}, "
          f"range: {mens_full['2']['overall']['summary']['min_score']}-{mens_full['2']['overall']['summary']['max_score']}")
    print(f"Women's 1st: {len(womens_1)} innings, avg score: {womens_full['1']['overall']['summary']['avg_score']}")
    print(f"Women's 2nd: {len(womens_2)} innings, avg score: {womens_full['2']['overall']['summary']['avg_score']}")
    print(f"\nDate range (men): {mens_full['1']['overall']['meta']['date_range']}")
    print(f"Date range (women): {womens_full['1']['overall']['meta']['date_range']}")
    print(f"\nGrounds modelled: {', '.join(mens_full['1']['venues'].keys())}")
    print("\nDone!")


if __name__ == "__main__":
    main()
