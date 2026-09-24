// @ts-check
/**
 * Records every integration-test failure to `.test-results/failures.log`.
 *
 * Written after a run failed two tests that could not be identified, because
 * the console output had been filtered. When it recurred, this log named
 * them — the first test of each app-level suite, over Jest's time limit while
 * loading the app (see `loadApp`) — and the machine's free memory. Every
 * failure records itself here — test, suite, duration, the first lines of the
 * error, and how loaded the machine was — whatever happens to the console.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

class FailureLogReporter {
  /** @param {unknown} _globalConfig @param {{ outputFile?: string }} options */
  constructor(_globalConfig, options = {}) {
    this.outputFile = options.outputFile ?? path.join(process.cwd(), '.test-results', 'failures.log');
    this.cpuAtStart = cpuTimes();
  }

  onRunStart() {
    this.cpuAtStart = cpuTimes();
  }

  /** @param {unknown} _contexts @param {import('@jest/test-result').AggregatedResult} results */
  onRunComplete(_contexts, results) {
    if (results.numFailedTests === 0 && results.numFailedTestSuites === 0) return;

    // CPU use across every core while the run lasted — not os.loadavg(),
    // which Windows does not implement and always reports as zero.
    const end = cpuTimes();
    const busy = end.busy - this.cpuAtStart.busy;
    const total = end.total - this.cpuAtStart.total;
    const cpuUse = total > 0 ? `${Math.round((100 * busy) / total)}%` : 'unknown';

    const lines = [
      `=== ${new Date().toISOString()}  failed ${results.numFailedTests} test(s) in ` +
        `${results.numFailedTestSuites} suite(s)  cpu ${cpuUse} of ${os.cpus().length} cores  ` +
        `free ${Math.round(os.freemem() / 2 ** 20)} MiB`,
    ];
    for (const suite of results.testResults) {
      const file = path.relative(process.cwd(), suite.testFilePath);
      if (suite.failureMessage && suite.testResults.length === 0) {
        lines.push(`  ${file}: suite failed to run`, indent(suite.failureMessage));
      }
      for (const test of suite.testResults) {
        if (test.status !== 'failed') continue;
        lines.push(`  ${file} › ${test.fullName} (${test.duration ?? '?'} ms)`, indent(test.failureMessages.join('\n')));
      }
    }

    fs.mkdirSync(path.dirname(this.outputFile), { recursive: true });
    fs.appendFileSync(this.outputFile, `${lines.join('\n')}\n`);
  }
}

/** Busy and total CPU time summed over every core, in milliseconds. */
function cpuTimes() {
  let busy = 0;
  let total = 0;
  for (const { times } of os.cpus()) {
    const all = times.user + times.nice + times.sys + times.irq + times.idle;
    busy += all - times.idle;
    total += all;
  }
  return { busy, total };
}

/** The first dozen lines of an error, indented, with terminal colour codes removed. */
function indent(text) {
  return text
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .slice(0, 12)
    .map((line) => `      ${line}`)
    .join('\n');
}

module.exports = FailureLogReporter;
