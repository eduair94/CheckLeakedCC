// Quick manual smoke test: `key=YOUR_KEY node test/index.js`
const CheckLeakedCC = require('../dist/index.js').default;
require('dotenv').config();

const api = new CheckLeakedCC(process.env.key);

(async () => {
  console.log('valid ->', await api.valid());
  console.log('experimental ->', await api.experimental('test1234@mail.com', 'email'));
  console.log('leakradar domain summary ->', await api.leakradar.domain.summary('example.com', { light: true }));
  console.log('tracking limits ->', await api.tracking.limits());
})().catch((e) => console.error(e));
