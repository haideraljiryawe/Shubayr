import { assertPushCliPolicy, parsePushCliArgs } from './push-cli-policy';

describe('push test CLI policy', () => {
  it('defaults to preview and requires account/operator allowlists', () => {
    const options = parsePushCliArgs([
      '--account',
      '+9647700000006',
      '--operator',
      'admin',
    ]);
    expect(options.preview).toBe(true);
    expect(() =>
      assertPushCliPolicy({
        options,
        nodeEnv: 'development',
        allowedAccounts: '+9647700000066',
        allowedOperators: 'admin',
      }),
    ).toThrow('ACCOUNT_NOT_ALLOWLISTED');
  });

  it('rejects an operator that was not explicitly authorized', () => {
    const options = parsePushCliArgs([
      '--account',
      '+9647700000006',
      '--operator',
      'catalog',
    ]);
    expect(() =>
      assertPushCliPolicy({
        options,
        nodeEnv: 'development',
        allowedAccounts: '+9647700000006',
        allowedOperators: 'admin',
      }),
    ).toThrow('OPERATOR_NOT_ALLOWLISTED');
  });

  it('requires both production override and exact send confirmation', () => {
    const options = parsePushCliArgs([
      '--account',
      '+9647700000006',
      '--operator',
      'admin',
      '--confirm',
      'SEND',
    ]);
    expect(() =>
      assertPushCliPolicy({
        options,
        nodeEnv: 'production',
        allowedAccounts: '+9647700000006',
        allowedOperators: 'admin',
      }),
    ).toThrow('PRODUCTION_SEND_REQUIRES_EXPLICIT_OVERRIDE');
    options.allowProduction = true;
    expect(() =>
      assertPushCliPolicy({
        options,
        nodeEnv: 'production',
        allowedAccounts: '+9647700000006',
        allowedOperators: 'admin',
      }),
    ).not.toThrow();
  });
});
