export const notificationTypes = [
  'order_placed',
  'order_confirmed',
  'order_status_changed',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'return_update',
  'loyalty_points_earned',
  'review_moderated',
  'promo',
  'new_order',
  'order_cancelled',
  'order_rejected',
  'delivery_assigned',
] as const;
export type NotificationType = (typeof notificationTypes)[number];
export const notificationChannels = ['push', 'sms'] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

export const criticalPair = (type: string, channel: string) =>
  type === 'order_confirmed' && channel === 'sms';

export function defaultEnabled(
  type: NotificationType,
  channel: NotificationChannel,
  legacy?: {
    order_updates: boolean;
    delivery_updates: boolean;
    return_updates: boolean;
    loyalty_updates: boolean;
    promotions: boolean;
  } | null,
): boolean {
  if (criticalPair(type, channel)) return true;
  if (type === 'promo')
    return channel === 'push' && (legacy?.promotions ?? false);
  const category =
    type === 'order_placed' ||
    type === 'order_confirmed' ||
    type === 'order_status_changed'
      ? 'order_updates'
      : ['out_for_delivery', 'delivered', 'delivery_failed'].includes(type)
        ? 'delivery_updates'
        : type === 'return_update'
          ? 'return_updates'
          : type === 'loyalty_points_earned'
            ? 'loyalty_updates'
            : 'order_updates';
  if (legacy?.[category] === false) return false;
  return channel === 'push' || ['delivered', 'delivery_failed'].includes(type);
}

export function bilingualMessage(type: NotificationType) {
  const arabic: Record<NotificationType, [string, string]> = {
    order_placed: ['تم استلام الطلب', 'تم استلام طلبك.'],
    order_confirmed: ['تم تأكيد الطلب', 'تم تأكيد طلبك.'],
    order_status_changed: ['تحديث الطلب', 'تم تحديث حالة طلبك.'],
    out_for_delivery: ['طلبك في الطريق', 'طلبك الآن في طريقه إليك.'],
    delivered: ['تم توصيل الطلب', 'تم توصيل طلبك بنجاح.'],
    delivery_failed: ['تعذر التوصيل', 'تعذر توصيل طلبك.'],
    return_update: ['تحديث الإرجاع', 'تم تحديث حالة طلب الإرجاع.'],
    loyalty_points_earned: ['نقاط جديدة', 'أضيفت نقاط الولاء إلى حسابك.'],
    review_moderated: ['تحديث التقييم', 'تمت مراجعة تقييم المنتج.'],
    promo: ['عرض من شُبير', 'لديك عرض جديد.'],
    new_order: ['طلب جديد', 'تم استلام طلب جديد للمتابعة.'],
    order_cancelled: ['تم إلغاء طلب', 'تم إلغاء طلب ويتطلب المتابعة.'],
    order_rejected: ['تم رفض الطلب', 'تم رفض الطلب وإطلاق حجز المخزون.'],
    delivery_assigned: ['مهمة توصيل جديدة', 'تم إسناد طلب جديد إليك.'],
  };
  const english: Record<NotificationType, [string, string]> = {
    order_placed: ['Order placed', 'We received your order.'],
    order_confirmed: ['Order confirmed', 'Your order has been confirmed.'],
    order_status_changed: ['Order update', 'Your order status has changed.'],
    out_for_delivery: ['On its way', 'Your order is out for delivery.'],
    delivered: ['Order delivered', 'Your order has been delivered.'],
    delivery_failed: ['Delivery failed', 'We could not deliver your order.'],
    return_update: ['Return update', 'Your return status has changed.'],
    loyalty_points_earned: [
      'Points earned',
      'Loyalty points were added to your account.',
    ],
    review_moderated: [
      'Review update',
      'Your product review has been moderated.',
    ],
    promo: ['Shubayr offer', 'A new offer is available.'],
    new_order: ['New order', 'A new order is ready for monitoring.'],
    order_cancelled: [
      'Order cancelled',
      'An order was cancelled and may need attention.',
    ],
    order_rejected: [
      'Order rejected',
      'The order was rejected and its stock reservation was released.',
    ],
    delivery_assigned: ['New delivery', 'A delivery has been assigned to you.'],
  };
  return {
    title_ar: arabic[type][0],
    body_ar: arabic[type][1],
    title_en: english[type][0],
    body_en: english[type][1],
  };
}

export function message(type: NotificationType, locale: string) {
  const content = bilingualMessage(type);
  const [title, body] =
    locale === 'en'
      ? [content.title_en, content.body_en]
      : [content.title_ar, content.body_ar];
  return { title, body };
}

export function normalizedLocale(value?: string | null): 'ar' | 'en' {
  return value?.toLowerCase().startsWith('en') ? 'en' : 'ar';
}
