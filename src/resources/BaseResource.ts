import type { IHttpClient } from '../http';

/**
 * Base class for every resource module. Resources collaborate with the HTTP
 * client through the `IHttpClient` interface so the transport can be swapped or
 * mocked without touching resource code.
 */
export abstract class BaseResource {
  constructor(protected readonly http: IHttpClient) {}
}
