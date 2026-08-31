import type { Reporter, TestCase } from '@playwright/test/reporter';

// T23-3E — the TIER-3 Smoke step dies by SIGTERM, and a cancelled step skips every later step,
// `if: always()` included (proven across runs 33407941305 / 33409692731 / 33415149509: the upload
// step reports `skipped` with a zero-second span). So no artifact can ever explain this failure —
// only what already reached stdout survives in the job log.
//
// The `list` reporter prints a test when it FINISHES, which leaves the test that was in flight
// when the signal arrived invisible. Three cancellations were read as three different culprits
// for exactly that reason, and the last one showed 29 seconds of total silence before the kill.
// Printing the title on START names the in-flight test whatever kills the run.
class ProgressReporter implements Reporter {
  onTestBegin(test: TestCase): void {
    const title = test.titlePath().filter(Boolean).join(' › ');
    // Written straight to stdout, unbuffered, so the line is already in the job log by the time
    // the signal lands — a reporter that batched output would lose precisely the last test.
    process.stdout.write(`[begin] ${title}\n`);
  }
}

export default ProgressReporter;
