import axios, { AxiosInstance } from 'axios';

export default class LeakCheckCC {
  private instance: AxiosInstance;
  constructor(key: string) {
    if (!key) throw new Error('Your bot api key is required. You can find it at https://checkleaked.cc/botLinks');
    this.instance = axios.create({
      baseURL: 'https://api.checkleaked.cc/api',
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json',
        'api-key': key,
      },
    });
  }
  async experimental(entry: string, type: string) {
    return this.instance.post('/experimental', { entry, type }).then((res) => res.data);
  }
  async dehashed(entry: string, type: string, page: number) {
    return this.instance.post('/dehashed', { entry, type, page }).then((res) => res.data);
  }
}
