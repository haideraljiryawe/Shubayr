import { ArgumentsHost, Logger } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter', () => {
  it('logs an unhandled 500 with request context and stack, without secrets', () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const request = {
      id: 'request-42',
      method: 'DELETE',
      baseUrl: '/api/v1',
      route: { path: '/me/account' },
      originalUrl: '/api/v1/me/account?token=secret',
      body: { code: '123456' },
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;
    const exception = new Error(
      'Failed for +9647701234567 code=123456 key=sk_dev_secret Bearer abc.def.ghi',
    );

    new ApiExceptionFilter().catch(exception, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      errors: [],
    });
    const entry = logged.mock.calls[0][0] as Record<string, unknown>;
    expect(entry).toEqual(
      expect.objectContaining({
        request_id: 'request-42',
        method: 'DELETE',
        route: '/api/v1/me/account',
        exception_class: 'Error',
      }),
    );
    expect(entry.stack).toEqual(expect.any(String));
    expect(String(entry.stack)).toContain('api-exception.filter.spec.ts');
    const rendered = JSON.stringify(entry);
    for (const secret of [
      '+9647701234567',
      '123456',
      'sk_dev_secret',
      'abc.def.ghi',
      'token=secret',
    ]) {
      expect(rendered).not.toContain(secret);
    }
    logged.mockRestore();
  });
});
