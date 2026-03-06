import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { containsMention, parseIntent } from '../src/github/comments.js';

describe('containsMention', () => {
  it('detects a mention', () => {
    assert.equal(containsMention('@my-bot please fix this', 'my-bot'), true);
  });

  it('is case-insensitive', () => {
    assert.equal(containsMention('@My-Bot please fix this', 'my-bot'), true);
  });

  it('returns false when not mentioned', () => {
    assert.equal(containsMention('LGTM', 'my-bot'), false);
  });

  it('requires word boundary', () => {
    assert.equal(containsMention('@my-bot-extension do this', 'my-bot'), false);
  });
});

describe('parseIntent', () => {
  it('extracts the instruction after the mention', () => {
    assert.equal(parseIntent('@my-bot please implement this feature', 'my-bot'), 'please implement this feature');
  });

  it('returns null when no instruction follows', () => {
    assert.equal(parseIntent('hey @my-bot', 'my-bot'), null);
  });

  it('trims whitespace', () => {
    assert.equal(parseIntent('@my-bot   fix the tests  ', 'my-bot'), 'fix the tests');
  });
});
