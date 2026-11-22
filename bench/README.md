# Model benchmark

Compares Claude models on Lyceo's real tasks before changing the model in production.

| Task | What it measures | Data |
| --- | --- | --- |
| Grading check-in answers | Agreement with a TA's right/wrong label, and false credit (a wrong answer graded right) | `data/grading.json`, 26 labeled answers |
| Math accuracy | Final numeric answer within tolerance, no tools | `data/math.json`, 18 problems with exact answers |
| Writing a lesson | The production lesson prompt's own format rules, plus a blind human review for factual errors | `data/lecture.md` |
| Grading v2 (`npm run bench:grading`) | Partial credit, equivalence, ambiguity, manipulation, calibration, agreement | `data/grading-v2.json`, 114 answers |

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

## Grading benchmark v2 (study sessions)

`npm run bench:grading` measures the grader the vertical slice will use (`app/lib/server/grading.ts`) on
`data/grading-v2.json`: 114 answers to 10 questions, labeled correct, partial, incorrect or unclear, covering
mathematical equivalence (fractions, percents, decimal commas, LaTeX, rearranged expressions), partial credit,
hedged and conflicting answers, Spanish, and attempts to instruct the grader.

- Without `ANTHROPIC_API_KEY` it runs the deterministic rules only, for free.
- With a key it also runs every model in `BENCH_MODELS`, and grades each model-graded answer twice with two
  different prompts to measure agreement.

`out/grading-report.md` has, per model: accuracy with a 95% Wilson interval, false credits (correct given to an
answer that isn't), recall of partial and unclear answers, manipulation failures, a confusion matrix, the
**calibration of the model's self-reported confidence** (reliability table, ECE, Brier, AUROC; Lyceo never uses
that number for decisions), agreement between the two gradings, results by kind of answer, and every mismatch.

The labels are drafts written by Claude. Fill in the `human_label` column of `out/grading-review.csv` (a second
grader if possible), save it as `data/grading-v2-human.csv`, and rerun: the script then reports Cohen's κ against
the human labels. Production readiness needs at least 150 human-confirmed cases (see `GATES` in `grading.ts`).
