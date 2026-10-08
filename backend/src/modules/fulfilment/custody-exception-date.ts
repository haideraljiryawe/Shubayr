import { businessDateText } from '../finance/business-date';

export function custodyExceptionBusinessDate(now = new Date()) {
  return businessDateText(now);
}
