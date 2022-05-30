import 'dotenv/config';
import LeakCheckCC from '../index';
test('CheckLeakedCC Experimental API', async () => {
  const leakCheckCC = new LeakCheckCC(process.env.key as string);
  const body = {
    entry: 'test1234@mail.com',
    type: 'email',
  };
  const res = await leakCheckCC.experimental(body.entry, body.type);
  expect(typeof res.found).toBe('number');
  return;
}, 70000);
