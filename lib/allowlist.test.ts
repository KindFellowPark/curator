import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowed, allowedEmails } from './allowlist.ts';

function withEnv(value: string | undefined, fn: () => void) {
  const prev = process.env.CURATOR_ALLOWED_EMAILS;
  if (value === undefined) delete process.env.CURATOR_ALLOWED_EMAILS;
  else process.env.CURATOR_ALLOWED_EMAILS = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.CURATOR_ALLOWED_EMAILS;
    else process.env.CURATOR_ALLOWED_EMAILS = prev;
  }
}

// The gate's whole point. Each of these is a way a real deploy could go wrong.
test('an allowlisted address is admitted', () => {
  withEnv('a@example.com,b@example.com', () => {
    assert.equal(isAllowed('a@example.com'), true);
    assert.equal(isAllowed('b@example.com'), true);
  });
});

test('a non-allowlisted address is refused', () => {
  withEnv('a@example.com,b@example.com', () => {
    assert.equal(isAllowed('c@example.com'), false);
  });
});

test('matching ignores case and surrounding whitespace on both sides', () => {
  withEnv(' A@Example.com , b@example.com ', () => {
    assert.equal(isAllowed('a@example.COM'), true);
    assert.equal(isAllowed('  b@example.com  '), true);
  });
});

test('a near miss is not a match', () => {
  withEnv('a@example.com', () => {
    assert.equal(isAllowed('aa@example.com'), false);
    assert.equal(isAllowed('a@example.co'), false);
    assert.equal(isAllowed('a@example.com.evil.test'), false);
  });
});

test('no identity is refused', () => {
  withEnv('a@example.com', () => {
    assert.equal(isAllowed(null), false);
    assert.equal(isAllowed(undefined), false);
    assert.equal(isAllowed(''), false);
  });
});

// Fail closed. A misconfigured deploy must lock everyone out, never let everyone in —
// this is the case that would otherwise turn a missing env var into a public app.
test('an unset allowlist admits nobody', () => {
  withEnv(undefined, () => {
    assert.equal(allowedEmails().length, 0);
    assert.equal(isAllowed('a@example.com'), false);
  });
});

test('an empty or comma-only allowlist admits nobody', () => {
  withEnv('', () => assert.equal(isAllowed('a@example.com'), false));
  withEnv('   ', () => assert.equal(isAllowed('a@example.com'), false));
  withEnv(',,,', () => assert.equal(isAllowed('a@example.com'), false));
});
