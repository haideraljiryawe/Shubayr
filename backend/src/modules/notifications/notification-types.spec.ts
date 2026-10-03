import { bilingualMessage } from './notification-types';

describe('notification messages', () => {
  it.each([
    'order_acceptance_late',
    'retrieval_update',
    'quantity_reduction_proposed',
    'cancellation_request_approved',
    'cancellation_request_denied',
  ] as const)('has real Arabic text for %s', (type) => {
    const message = bilingualMessage(type);
    expect(message.title_ar).toMatch(/[\u0600-\u06ff]/);
    expect(message.body_ar).toMatch(/[\u0600-\u06ff]/);
    expect(message.title_ar).not.toBe(message.title_en);
  });
});
