import { errorFromResponse, errorMessageFromBody, CheckLeakedAuthError, CheckLeakedValidationError } from '../errors';

describe('error helpers', () => {
  test('detects string error body', () => {
    expect(errorMessageFromBody({ error: 'Unauthorized' })).toBe('Unauthorized');
  });

  test('detects validation array error body', () => {
    expect(errorMessageFromBody({ error: [{ msg: 'entry is required' }] })).toBe('entry is required');
  });

  test('ignores non-error bodies', () => {
    expect(errorMessageFromBody({ found: 0 })).toBeUndefined();
    expect(errorMessageFromBody('ok')).toBeUndefined();
  });

  test('maps 401 to auth error', () => {
    const e = errorFromResponse({ status: 401, body: { error: 'Unauthorized' } });
    expect(e).toBeInstanceOf(CheckLeakedAuthError);
    expect(e.message).toBe('Unauthorized');
  });

  test('maps 400/422 to validation error', () => {
    expect(errorFromResponse({ status: 400, body: {} })).toBeInstanceOf(CheckLeakedValidationError);
    expect(errorFromResponse({ status: 422, body: {} })).toBeInstanceOf(CheckLeakedValidationError);
  });
});
