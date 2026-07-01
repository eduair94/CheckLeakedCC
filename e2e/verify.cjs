/* eslint-disable */
const { CheckLeakedCC } = require('../dist/index.js');
const KEY = process.env.KEY || process.argv[2];
const api = new CheckLeakedCC({ apiKey: KEY, throwOnErrorBody: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  try {
    const adv = await api.leakradar.advanced.search({ password: 'test' }, { page_size: 2 });
    console.log('advanced.search ->', JSON.stringify({ total: adv.total, error: adv.error, first: adv.items && adv.items[0] }, null, 2));
  } catch (e) { console.log('advanced.search ERR', e.message); }
  await sleep(800);
  try {
    const rep = await api.leakradar.domain.report('checkleaked.cc');
    console.log('domain.report keys ->', Object.keys(rep));
    console.log('summary ->', JSON.stringify(rep.summary));
  } catch (e) { console.log('domain.report ERR', e.message); }
  await sleep(800);
  try {
    const tree = await api.leakradar.container.tree({ container_id: 173155, prefix: '' });
    console.log('container.tree ->', JSON.stringify({ total: tree.total, first: tree.items && tree.items[0] }, null, 2));
  } catch (e) { console.log('container.tree ERR', e.message); }
})();
