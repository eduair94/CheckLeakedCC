import 'dotenv/config';
import CheckLeakedCC from '../index';

// Live smoke test — only runs when a real bot key is provided via `key` env.
const key = process.env.key;
const maybe = key ? test : test.skip;

maybe(
  'experimental live search returns a numeric found',
  async () => {
    const api = new CheckLeakedCC(key as string);
    const res = await api.experimental('test1234@mail.com', 'email');
    expect(typeof res.found).toBe('number');
  },
  70000,
);

maybe(
  'valid returns a plan',
  async () => {
    const api = new CheckLeakedCC(key as string);
    const res = await api.valid();
    expect(res.success).toBe(true);
  },
  30000,
);
