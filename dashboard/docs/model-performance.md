# Model-versus-provider comparison

## Evidence found

`c04/evaluation/real_backtest.csv` stores side-by-side backtest aggregates for our main ensemble (`ours_ens (winter: + lgbm push-pull)`) and `partner_fc (TVB forecast)`. No training or data fetch is needed to use these existing results.

`c04/models/real_backtest.py:evaluate` defines the evaluation windows and metric formulas:

- Winter: 1 November 2025–30 April 2026.
- Summer: 1 May–31 October 2026.
- Declared training origin for both: 31 October 2025.
- Actuals: observed TVB / feratel guest nights available within those windows.

| Period | Our daily wMAPE | TVB daily wMAPE | Our monthly MAPE | TVB monthly MAPE |
|---|---:|---:|---:|---:|
| Winter 2025/26 | 8.4945% | 5.5340% | 3.7274% | 6.0808% |
| May–October 2026 | 18.4047% | 15.4155% | 19.0898% | 20.0679% |

Lower is better. The stored daily-error score is lower for TVB in both windows; the stored monthly-error score is lower for our model. The page does not claim an overall winner.

## Limits that must remain visible

The saved CSV is **not sufficient to certify a fair forecasting contest**:

- The evaluator explicitly says the TVB forecast vintage is unknown and may not be ex ante. Equal forecast horizons or information sets cannot be verified.
- `common.wmape` masks missing actuals/predictions separately for each model. Although the evaluation window is the same, the aggregate file does not record matched daily coverage. Exact identical scored-day sets cannot be established from these summaries.
- There is no saved paired historical daily prediction/actual series in the tracked outputs used for this feature. The graph therefore compares recorded aggregate errors, not invented daily forecast curves.
- Summer peak-day scores are missing. They remain null / unavailable, never zero, and have no ranking.
- The future 2026/27 outlook is not accuracy evidence because actual outcomes are not yet known.
- This section's exact backtest windows differ from the full historical-season boundaries used in the separate Deviations section. Its monthly MAPE is also different from the monthly weighted error metric in that section.

To make a strict same-day, same-horizon comparison, obtain paired date-level actuals, both predictions, issued-at timestamps and training cutoffs, then recompute both metrics on the identical nonmissing intersection. Do not remove these caveats merely because the aggregate scores exist.

## Implementation

`python dashboard/scripts/export-model-performance.py` reads the saved CSV, selects exactly the two named models in each known evaluation window and exports `dashboard/src/analytics/model-performance.json`. It fails on duplicate/missing model rows and invalid numeric scores. The export records the source file, evaluator, SHA-256 and explicitly unknown matched-day count.

The Data page adds a static, labelled backtest section with grouped horizontal error bars, three metric controls, direct percentage-point score comparisons, a numerical table and provenance. Analysis date/country filters never relabel these fixed evaluation windows. No server endpoint, secret, model training or batch job is added. Export should be rerun when the saved backtest file changes; it is deliberately not mislabelled as a live API evaluation.

Validation: `python dashboard/scripts/test_export_model_performance.py`, dashboard typecheck/build, existing unit tests and Playwright tests. Export tests verify every score against the CSV, reproducibility, exact boundaries, null preservation and failure on invalid/missing records. Browser tests verify both rankings, missing summer peak scores, visible caveats, independent filter scope, deep links and mobile layout.
