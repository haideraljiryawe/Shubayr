export type PushCliOptions = {
  account?: string;
  operator?: string;
  platform: 'ios' | 'android' | 'all';
  device?: string;
  title?: string;
  body?: string;
  operationId?: string;
  list: boolean;
  preview: boolean;
  confirmed: boolean;
  allowProduction: boolean;
};

export function parsePushCliArgs(argv: string[]): PushCliOptions {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const platform = value('--platform') ?? 'all';
  if (!['ios', 'android', 'all'].includes(platform)) {
    throw new Error('PLATFORM_INVALID');
  }
  return {
    account: value('--account'),
    operator: value('--operator'),
    platform: platform as PushCliOptions['platform'],
    device: value('--device'),
    title: value('--title'),
    body: value('--body'),
    operationId: value('--operation-id'),
    list: argv.includes('--list'),
    preview: argv.includes('--preview') || !argv.includes('--confirm'),
    confirmed: value('--confirm') === 'SEND',
    allowProduction: argv.includes('--allow-production'),
  };
}

export function assertPushCliPolicy(input: {
  options: PushCliOptions;
  nodeEnv: string | undefined;
  allowedAccounts: string | undefined;
  allowedOperators: string | undefined;
}) {
  const accounts = csvSet(input.allowedAccounts);
  const operators = csvSet(input.allowedOperators);
  if (!input.options.account || !accounts.has(input.options.account)) {
    throw new Error('ACCOUNT_NOT_ALLOWLISTED');
  }
  if (!input.options.operator || !operators.has(input.options.operator)) {
    throw new Error('OPERATOR_NOT_ALLOWLISTED');
  }
  if (
    input.nodeEnv === 'production' &&
    (!input.options.allowProduction || !input.options.confirmed)
  ) {
    throw new Error('PRODUCTION_SEND_REQUIRES_EXPLICIT_OVERRIDE');
  }
}

function csvSet(value: string | undefined) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}
