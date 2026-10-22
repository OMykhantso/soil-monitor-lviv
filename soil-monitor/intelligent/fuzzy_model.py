"""MKR Lviv soil Model A — Mamdani type-1 FIS.

Exactly implements section 2.3: 5 inputs (Pb,Cd,Zn [mg/kg], pH, AP),
243 equally weighted AND rules, min implication, max aggregation, centroid.
No artificial measurements or stochastic components.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from itertools import product
from math import isfinite
from pathlib import Path
from typing import Any

import numpy as np

INPUTS = ("pb", "cd", "zn", "ph", "ap")
INPUT_NAMES = ("Pb", "Cd", "Zn", "pH", "AP")
INPUT_RANGES = ((0., 30.), (0., 3.5), (0., 115.), (3., 10.), (0., 10.))
GDK = {"pb": 6., "cd": .7, "zn": 23.}
# term order is MATCHED to the eight-column MATLAB numeric CSV
INPUT_MFS = (
    ((0., 0., 1.8, 6.), (1.8, 6., 15.), (6., 15., 30., 30.)),
    ((0., 0., .21, .7), (.21, .7, 1.75), (.7, 1.75, 3.5, 3.5)),
    ((0., 0., 6.9, 23.), (6.9, 23., 57.5), (23., 57.5, 115., 115.)),
    ((3., 3., 5.2, 6.8), (5.2, 6.8, 8.2), (6.8, 8.2, 10., 10.)),
    ((0., 0., 2., 5.), (2., 5., 7.5), (5., 7.5, 10., 10.)),
)
OUTPUT_MFS = (
    (0., 0., 1.5, 3.), (1.5, 3., 5.5),
    (3., 5.5, 8.), (5.5, 8., 10., 10.),
)
INPUT_TERMS = (
    ("низький", "помірний", "високий"),
    ("низький", "помірний", "високий"),
    ("низький", "помірний", "високий"),
    ("кислий", "близький до нейтрального", "лужний"),
    ("низьке", "помірне", "високе"),
)
OUTPUT_TERMS = ("низький", "помірний", "високий", "критичний")
DEFAULT_RULES_PATH = Path(__file__).resolve().parent / "data" / "rules_matlab_243.csv"


def membership(x: float | np.ndarray, params: tuple[float, ...]) -> np.ndarray:
    """MATLAB-style trimf / trapmf, including shoulder cases a=b and c=d."""
    xarr = np.asarray(x, dtype=float)
    if len(params) == 3:
        a, b, c = params
        if not a < b < c:
            raise ValueError("Invalid triangular membership function")
        left = (xarr - a) / (b - a)
        right = (c - xarr) / (c - b)
        result = np.maximum(0., np.minimum(left, right))
    elif len(params) == 4:
        a, b, c, d = params
        if not (a <= b <= c <= d and a < d):
            raise ValueError("Invalid trapezoidal membership function")
        left = np.ones_like(xarr) if a == b else (xarr - a) / (b - a)
        right = np.ones_like(xarr) if c == d else (d - xarr) / (d - c)
        result = np.maximum(0., np.minimum(np.minimum(left, 1.), right))
    else:
        raise ValueError("Membership must have 3 or 4 parameters")
    return np.clip(result, 0., 1.)


def rule_category(terms: tuple[int, ...]) -> tuple[int, int, int]:
    """1-based MATLAB term IDs -> 1-based output category, b (0..3), delta."""
    h = sum(i == 3 for i in terms[:3]); m = sum(i == 2 for i in terms[:3])
    b = 3 if h >= 2 else 2 if h == 1 else 1 if m else 0
    delta = int((terms[3] == 1 or terms[4] == 3) and (h >= 1 or m >= 2))
    return min(3, b + delta) + 1, b, delta


@dataclass(frozen=True)
class Rule:
    id: int
    antecedent: tuple[int, int, int, int, int]
    consequent: int
    weight: float = 1.
    connection: int = 1


def generated_rules() -> tuple[Rule, ...]:
    return tuple(Rule(k, terms, rule_category(terms)[0])
                 for k, terms in enumerate(product((1, 2, 3), repeat=5), 1))


def load_rules(path: str | Path = DEFAULT_RULES_PATH) -> tuple[Rule, ...]:
    """Read and strictly validate existing thesis MATLAB addRule matrix, no headers."""
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    if len(rows) != 243:
        raise ValueError(f"Expected 243 rules, got {len(rows)}")
    result = []
    for n, row in enumerate(rows, 1):
        if len(row) != 8:
            raise ValueError(f"Rule {n} needs 8 columns")
        try:
            values = [float(v) for v in row]
        except ValueError as exc:
            raise ValueError(f"Rule {n}: nonnumeric field") from exc
        if not all(v.is_integer() for v in values):
            raise ValueError(f"Rule {n}: expected integer indices/weight/operator")
        indices = tuple(int(v) for v in values)
        if not (all(1 <= t <= 3 for t in indices[:5])
                and 1 <= indices[5] <= 4 and indices[6:] == (1, 1)):
            raise ValueError(f"Invalid terms/output/weight/AND in rule {n}")
        result.append(Rule(n, indices[:5], indices[5]))
    result = tuple(result)
    if result != generated_rules():
        raise ValueError("The CSV does not exactly match the approved 243-rule model or ordering")
    return result


class SoilFuzzyModel:
    def __init__(self, *, sample_points: int = 1001, rules_path: str | Path = DEFAULT_RULES_PATH):
        if not isinstance(sample_points, int) or sample_points < 101:
            raise ValueError("sample_points must be integer >= 101")
        self.rules = load_rules(rules_path)
        self.sample_points = sample_points
        self.grid = np.linspace(0., 10., sample_points)
        self.output_memberships = np.stack([membership(self.grid, mf) for mf in OUTPUT_MFS])

    def evaluate(self, *, pb: float, cd: float, zn: float, ph: float, ap: float,
                 top_rules: int = 8) -> dict[str, Any]:
        vals = (pb, cd, zn, ph, ap)
        for name, val, (lo, hi) in zip(INPUT_NAMES, vals, INPUT_RANGES):
            if isinstance(val, bool) or not isinstance(val, (int, float)) or not isfinite(val):
                raise ValueError(f"{name}: required finite numeric value")
            if not lo <= val <= hi:
                raise ValueError(f"{name}: {val} outside FIS model domain [{lo}; {hi}]")
        if float(ap) != int(ap):
            raise ValueError("AP must be an integer sum of the five expert criteria")
        if not 0 <= top_rules <= 243:
            raise ValueError("top_rules must be in [0, 243]")
        fuzz = np.array([[float(membership(v, mf)) for mf in mf_list]
                         for v, mf_list in zip(vals, INPUT_MFS)])
        # max implication alpha for each output term; equal output MFs can be merged before min/max
        heights = np.zeros(4)
        active_rules = []
        for rule in self.rules:
            alpha = min(fuzz[j, idx - 1] for j, idx in enumerate(rule.antecedent))
            if alpha <= 0.:
                continue
            heights[rule.consequent - 1] = max(heights[rule.consequent - 1], alpha)
            active_rules.append((rule, float(alpha)))
        aggregate = np.max(np.minimum(self.output_memberships, heights[:, None]), axis=0)
        if not np.any(aggregate):
            raise RuntimeError("No fuzzy rule activated")
        # Discrete centroid, with uniform output grid. MATLAB evalfis uses NumSamplePoints.
        score = float(np.sum(self.grid * aggregate) / np.sum(aggregate))
        out_degrees = np.array([float(membership(score, mf)) for mf in OUTPUT_MFS])
        # Ties -> higher severity, consistent with section 2.3.
        category_idx = max(range(4), key=lambda j: (out_degrees[j], j))
        active_rules.sort(key=lambda ra: (-ra[1], ra[0].id))
        significant = [
            {"id": r.id,
             "antecedent": dict(zip(INPUT_NAMES,
                                    (INPUT_TERMS[i][t-1] for i,t in enumerate(r.antecedent)))),
             "output": OUTPUT_TERMS[r.consequent-1],
             "activation": round(alpha, 6)}
            for r, alpha in active_rules[:top_rules]
        ]
        return {
            "score": round(score, 6),
            "category": OUTPUT_TERMS[category_idx],
            "output_membership_at_score": {OUTPUT_TERMS[i]: round(float(x), 6) for i, x in enumerate(out_degrees)},
            "input": dict(zip(INPUTS, (float(v) for v in vals))),
            "multiples_gdk": {k: round(float(v / GDK[k]), 6)
                              for k, v in zip(INPUTS[:3], vals[:3])},
            "active_rule_count": len(active_rules),
            "top_rules": significant,
            "model": {"version": "MKR-A-2.3-1.0", "type": "Mamdani type-1",
                      "and": "min", "implication": "min", "aggregation": "max",
                      "defuzzification": "centroid (discrete)",
                      "output_samples": self.sample_points, "rule_count": len(self.rules)},
        }


if __name__ == "__main__":
    import json
    print(json.dumps(SoilFuzzyModel().evaluate(pb=6, cd=.7, zn=23, ph=6.8, ap=1), ensure_ascii=False, indent=2))
