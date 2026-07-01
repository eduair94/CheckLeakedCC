import { CoreResource } from '../resources/CoreResource';
import { NativeTrackingResource } from '../resources/TrackingResource';
import { LeakRadarClient } from '../leakradar/LeakRadarClient';
import type { IHttpClient, RequestOptions } from '../http';

/** Records the last request instead of hitting the network. */
class FakeHttp implements IHttpClient {
  public last: RequestOptions | null = null;
  public calls: RequestOptions[] = [];
  async request<T>(opts: RequestOptions): Promise<T> {
    this.last = opts;
    this.calls.push(opts);
    return {} as T;
  }
}

describe('core resource request mapping', () => {
  const http = new FakeHttp();
  const core = new CoreResource(http);

  test('valid -> GET /valid', async () => {
    await core.valid();
    expect(http.last).toMatchObject({ method: 'GET', path: '/valid' });
  });

  test('dehashed -> POST /dehashed with entry/type/page', async () => {
    await core.dehashed('john@example.com', 'email', { page: 2, wildcard: true });
    expect(http.last?.method).toBe('POST');
    expect(http.last?.path).toBe('/dehashed');
    expect(http.last?.body).toMatchObject({ entry: 'john@example.com', type: 'email', page: 2, wildcard: true });
  });

  test('experimental -> POST /experimental', async () => {
    await core.experimental('john', 'username', { loadAll: true });
    expect(http.last).toMatchObject({ method: 'POST', path: '/experimental' });
    expect(http.last?.body).toMatchObject({ entry: 'john', type: 'username', loadAll: true });
  });

  test('leakCheck -> GET /leak_check with query', async () => {
    await core.leakCheck('john@example.com', 'email');
    expect(http.last?.method).toBe('GET');
    expect(http.last?.path).toBe('/leak_check');
    expect(http.last?.query).toMatchObject({ check: 'john@example.com', type: 'email' });
  });

  test('crackHash -> POST /crack_hash', async () => {
    await core.crackHash('5f4dcc3b5aa765d61d8327deb882cf99');
    expect(http.last).toMatchObject({ method: 'POST', path: '/crack_hash' });
    expect(http.last?.body).toMatchObject({ hash: '5f4dcc3b5aa765d61d8327deb882cf99' });
  });

  test('ip -> GET /ip', async () => {
    await core.ip('1.1.1.1');
    expect(http.last).toMatchObject({ method: 'GET', path: '/ip' });
    expect(http.last?.query).toMatchObject({ ip: '1.1.1.1' });
  });
});

describe('tracking resource mapping', () => {
  const http = new FakeHttp();
  const tracking = new NativeTrackingResource(http);

  test('native add -> POST /tracking/new', async () => {
    await tracking.add('example.com', 'domain');
    expect(http.last).toMatchObject({ method: 'POST', path: '/tracking/new' });
    expect(http.last?.body).toMatchObject({ entry: 'example.com', type: 'domain' });
  });

  test('leakradar add -> POST /tracking/leakradar/new', async () => {
    await tracking.leakradar.add('example.com', 'domain');
    expect(http.last).toMatchObject({ method: 'POST', path: '/tracking/leakradar/new' });
  });

  test('native limits -> GET /tracking/limit', async () => {
    await tracking.limits();
    expect(http.last).toMatchObject({ method: 'GET', path: '/tracking/limit' });
  });

  test('cleanEntries -> GET /tracking/clean_entries', async () => {
    await tracking.cleanEntries();
    expect(http.last).toMatchObject({ method: 'GET', path: '/tracking/clean_entries' });
  });
});

describe('leakradar resource mapping', () => {
  const http = new FakeHttp();
  const lr = new LeakRadarClient(http);

  test('email.search -> POST /leakradar/search/email', async () => {
    await lr.email.search('foo@bar.com', { page: 1, auto_unlock: false });
    expect(http.last?.path).toBe('/leakradar/search/email');
    expect(http.last?.body).toMatchObject({ email: 'foo@bar.com' });
    expect(http.last?.query).toMatchObject({ page: 1, auto_unlock: false });
  });

  test('domain.report -> GET /leakradar/domain/report', async () => {
    await lr.domain.report('example.com');
    expect(http.last).toMatchObject({ method: 'GET', path: '/leakradar/domain/report' });
    expect(http.last?.query).toMatchObject({ domain: 'example.com' });
  });

  test('domain.employees -> GET bucket path', async () => {
    await lr.domain.employees('example.com');
    expect(http.last?.path).toBe('/leakradar/domain/example.com/employees');
  });

  test('unlocked.setStatus -> POST status path', async () => {
    await lr.unlocked.setStatus('leak-123', 'fixed');
    expect(http.last?.path).toBe('/leakradar/unlocked/leak-123/status');
    expect(http.last?.body).toMatchObject({ status: 'fixed' });
  });

  test('password.pwned string -> POST /leakradar/pwned', async () => {
    await lr.password.pwned('hunter2');
    expect(http.last).toMatchObject({ method: 'POST', path: '/leakradar/pwned' });
    expect(http.last?.body).toMatchObject({ password: 'hunter2' });
  });

  test('darkWeb.search string query -> POST', async () => {
    await lr.darkWeb.search('acme', { page: 2 });
    expect(http.last?.path).toBe('/leakradar/dark-web/search');
    expect(http.last?.body).toMatchObject({ query: 'acme' });
    expect(http.last?.query).toMatchObject({ page: 2 });
  });

  test('notifications.methods.list -> GET', async () => {
    await lr.notifications.methods.list();
    expect(http.last).toMatchObject({ method: 'GET', path: '/leakradar/notification-methods' });
  });

  test('unlock by ids -> POST /leakradar/unlock', async () => {
    await lr.unlock({ leak_ids: ['a', 'b'] });
    expect(http.last?.path).toBe('/leakradar/unlock');
    expect(http.last?.body).toMatchObject({ leak_ids: ['a', 'b'] });
  });
});
