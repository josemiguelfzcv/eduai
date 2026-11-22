# Model benchmark

Compares Claude models on Lyceo's real tasks before changing the model in production.

| Task | What it measures | Data |
| --- | --- | --- |
| Grading check-in answers | Agreement with a TA's right/wrong label, and false credit (a wrong answer graded right) | `data/grading.json`, 26 labeled answers |
| Math accuracy | Final numeric answer within tolerance, no tools | `data/math.json`, 18 problems with exact answers |
| Writing a lesson | The production lesson prompt's own format rules, plus a blind human review for factual errors | `data/lecture.md` |

Every call also records latency and cost from the tokens it reports (prices in `app/lib/server/usage.ts`).

## Run it

Locally, with a key that has a spend limit:

```
ANTHROPIC_API_KEY=sk-ant-… npm run bench
```

Or on GitHub: add the repository secret `ANTHROPIC_API_KEY`, open Actions → Model benchmark → Run workflow, and download
the `bench-results` artifact.

Options: `BENCH_MODELS` (comma-separated model ids), `BENCH_REPEAT` (runs per case, 3 gives a sense of variance).
`BENCH_DRY_RUN=1` checks the harness with canned answers and costs nothing.

One run of all three default models costs well under $1.

## Read the results

- `out/report.md`: scores, false credits, latency (p50, p95), cost per call and whether each model passes the gates.
- `out/lessons-blind.md`: the lessons as A, B, C. Note every factual or math error before opening `out/lessons-key.json`.
- `out/results.json`: every call and its usage.

Add real course material and real (anonymized, consented) student answers to the data files over time; the labels
should come from a person, not a model.
