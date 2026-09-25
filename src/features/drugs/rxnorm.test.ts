/**
 * Run with: npm run test:unit
 *
 * How a barcode lookup reports a failure to ask — which decides whether the
 * user is told to check their connection.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { resolveNdcCandidates } from './rxnorm.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Answer = (url: string) => Promise<Response>;
const stub = (answer: Answer) => {
  globalThis.fetch = ((url: string) => answer(url)) as typeof fetch;
};

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

const active = { ndcStatus: { ndc11: '00000000001', status: 'ACTIVE', rxcui: '1', conceptName: 'X' } };

test('no connection at all is offline', async () => {
  stub(() => Promise.reject(new TypeError('Network request failed')));
  assert.deepEqual(await resolveNdcCandidates(['00000000001']), { status: 'offline' });
});

test('a service answering with an error is unavailable, not offline', async () => {
  stub(() => json({}, 503));
  assert.deepEqual(await resolveNdcCandidates(['00000000001', '00000000002']), {
    status: 'unavailable',
  });
});

test('a service answering with something that is not JSON is unavailable', async () => {
  stub(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    } as unknown as Response)
  );
  assert.deepEqual(await resolveNdcCandidates(['00000000001']), { status: 'unavailable' });
});

test('a mix of a dropped request and a service error is offline: the connection may be at fault', async () => {
  let calls = 0;
  stub(() => (calls++ === 0 ? Promise.reject(new TypeError('Network request failed')) : json({}, 500)));
  assert.deepEqual(await resolveNdcCandidates(['00000000001', '00000000002']), { status: 'offline' });
});

test('one answer among failures is still not an identification', async () => {
  let calls = 0;
  stub(() => (calls++ === 0 ? json(active) : json({}, 502)));
  assert.equal((await resolveNdcCandidates(['00000000001', '00000000002'])).status, 'unavailable');
});
