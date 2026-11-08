import ast
import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('exporter', Path(__file__).with_name('export-model-performance.py'))
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)

class PerformanceExportTests(unittest.TestCase):
    def test_export_matches_saved_csv_and_committed_report(self):
        output = exporter.export()
        committed = json.loads((exporter.ROOT / 'dashboard/src/analytics/model-performance.json').read_text())
        self.assertEqual(output, committed)
        with exporter.SOURCE.open() as file:
            rows = list(csv.DictReader(file))
        for window in output['windows']:
            for model in window['models'].values():
                source = next(row for row in rows if row['window'] == window['id'] and row['model'] == model['source_model'])
                for metric, column in exporter.METRICS.items():
                    self.assertEqual(model['metrics'][metric], float(source[column]) if source[column] else None)
            self.assertIsNone(window['matched_day_count'])
        self.assertEqual(output['windows'][0]['start'], '2025-11-01')
        self.assertEqual(output['windows'][0]['end'], '2026-04-30')
        self.assertEqual(output['windows'][1]['start'], '2026-05-01')
        self.assertEqual(output['windows'][1]['end'], '2026-10-31')

    def test_periods_match_evaluator_calls_not_display_labels(self):
        tree=ast.parse((exporter.ROOT / 'c04/models/real_backtest.py').read_text())
        calls={}
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'evaluate' and len(node.args) >= 4:
                values=[ast.literal_eval(arg) for arg in node.args[:4]]
                calls[values[3]]=values[:3]
        for window in exporter.export()['windows']:
            self.assertEqual([window['training_cutoff'], window['start'], window['end']], calls[window['id']])

    def mutate(self, change):
        with exporter.SOURCE.open() as file:
            rows=list(csv.DictReader(file))
        change(rows)
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'scores.csv'
            with path.open('w') as file:
                writer=csv.DictWriter(file,fieldnames=rows[0].keys());writer.writeheader();writer.writerows(rows)
            return exporter.export(path)

    def test_missing_model_does_not_become_a_zero_score(self):
        with self.assertRaises(ValueError):
            self.mutate(lambda rows: rows.pop(0))

    def test_nonfinite_or_negative_errors_are_rejected(self):
        for bad in ['nan','inf','-1']:
            with self.assertRaises(ValueError):
                self.mutate(lambda rows: rows[0].update({'daily wMAPE':bad}))

    def test_missing_peak_scores_remain_unavailable(self):
        summer=exporter.export()['windows'][1]
        self.assertIsNone(summer['models']['ours']['metrics']['peak_wmape'])
        self.assertIsNone(summer['models']['provider']['metrics']['peak_wmape'])

if __name__=='__main__':
    unittest.main()
