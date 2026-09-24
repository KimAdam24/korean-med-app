/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { crashLines } from './crash-lines.ts';

const PACKAGE = 'com.togurt5.koreanmedassistant';

test('recognises the launch crash from the stripped DETECT_SCREEN_CAPTURE permission', () => {
  // As reported from the dev build, and as React Native logs it.
  const log = [
    '09-24 10:01:02.100  12815 12840 I ReactNativeJS: Running "main"',
    '09-24 10:01:02.310  12815 12840 E ReactNativeJS: [runtime not ready]: Error: Exception in HostFunction: ' +
      'Permission Denial: registerScreenCaptureObserver from pid=12815, uid=10230 requires ' +
      'android.permission.DETECT_SCREEN_CAPTURE',
  ].join('\n');

  assert.equal(crashLines(log, PACKAGE, '12815').length, 1);
});

test('recognises a native fatal exception by the process it names', () => {
  const log = [
    '09-24 10:01:02.100  12815 12815 E AndroidRuntime: FATAL EXCEPTION: main',
    `09-24 10:01:02.100  12815 12815 E AndroidRuntime: Process: ${PACKAGE}, PID: 12815`,
    '09-24 10:01:02.100  12815 12815 E AndroidRuntime: java.lang.SecurityException: Permission Denial',
  ].join('\n');

  assert.ok(crashLines(log, PACKAGE).length >= 1);
});

test("ignores another app's crash, and a clean launch", () => {
  const log = [
    '09-24 10:01:02.100   900   900 E AndroidRuntime: FATAL EXCEPTION: main',
    '09-24 10:01:02.100   900   900 E AndroidRuntime: Process: com.example.other, PID: 900',
    '09-24 10:01:02.300  12815 12840 I ReactNativeJS: Running "main"',
  ].join('\n');

  assert.deepEqual(crashLines(log, PACKAGE, '12815'), []);
});
