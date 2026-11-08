"""Export existing backtest aggregates only. Does not train or recalculate a model."""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'models/results_real_backtest.csv'
WINDOWS = {
    'winter 25/26': ('Winter 2025/26', '2025-11-01', '2026-04-30'),
    'May-Oct 2026': ('May–October 2026', '2026-05-01', '2026-10-31'),
}
MODELS = {'ours': 'ours_ens (winter: + lgbm push-pull)', 'provider': 'partner_fc (TVB forecast)'}
METRICS = {'daily_wmape': 'daily wMAPE', 'monthly_mape': 'monthly MAPE', 'peak_wmape': 'peak-day wMAPE'}

def export(source=SOURCE):
    with source.open() as file:
        rows = list(csv.DictReader(file))
    windows = []
    for key, (label, start, end) in WINDOWS.items():
        models = {}
        for model, identifier in MODELS.items():
            matches = [row for row in rows if row['window'] == key and row['model'] == identifier]
            if len(matches) != 1:
                raise ValueError(f'Expected exactly one saved result for {key} / {identifier}')
            scores = {}
            for metric, column in METRICS.items():
                value = matches[0][column]
                score = float(value) if value else None
                if score is not None and not (0 <= score < float('inf')):
                    raise ValueError(f'Invalid saved score: {key} / {column}')
                scores[metric] = score
            models[model] = {'source_model': identifier, 'metrics': scores}
        windows.append({'id': key, 'label': label, 'start': start, 'end': end, 'training_cutoff': '2025-10-31', 'matched_day_count': None, 'models': models})
    return {'source': 'models/results_real_backtest.csv', 'evaluator': 'models/real_backtest.py',
            'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'windows': windows}

if __name__ == '__main__':
    destination = ROOT / 'dashboard/src/analytics/model-performance.json'
    destination.write_text(json.dumps(export(), indent=2, ensure_ascii=False) + '\n')
    print(f'Exported existing aggregates to {destination.relative_to(ROOT)}')
