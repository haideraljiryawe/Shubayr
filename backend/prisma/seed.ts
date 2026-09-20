import 'dotenv/config';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  calculateLineTotal,
  minorUnitsToMoney,
  moneyToMinorUnits,
} from '../src/modules/catalog/pricing';
import { cartUnitPrice } from '../src/modules/orders/cart-pricing';

const databaseUrl = required('DATABASE_URL');
const publicApiUrl = (
  process.env.PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'
).replace(/\/$/, '');
const bucket = process.env.S3_BUCKET ?? 'shubayr-media';
const s3 = new S3Client({
  endpoint: required('S3_ENDPOINT'),
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: required('S3_ACCESS_KEY'),
    secretAccessKey: required('S3_SECRET_KEY'),
  },
});
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const roles = [
  ['admin', 'Full system access'],
  ['manager', 'Store operations and catalog'],
  ['purchasing', 'Suppliers and purchase invoices'],
  ['warehouse', 'Stock, batches, and picking'],
  ['delivery', 'Delivery agent'],
  ['customer', 'End customer'],
] as const;

const permissions = [
  ['catalog.view', 'catalog', 'View products and categories'],
  ['catalog.manage', 'catalog', 'Create and update catalog data'],
  ['orders.view', 'orders', 'View orders'],
  ['orders.confirm', 'orders', 'Confirm and cancel orders'],
  ['orders.update', 'orders', 'Update order status'],
  ['inventory.view', 'inventory', 'View stock and locations'],
  ['inventory.pick', 'inventory', 'Perform picking'],
  ['inventory.adjust', 'inventory', 'Adjust stock'],
  ['inventory.transfer', 'inventory', 'Transfer stock'],
  ['purchasing.view', 'purchasing', 'View purchasing data'],
  ['purchasing.manage', 'purchasing', 'Manage purchasing data'],
  ['returns.view', 'returns', 'View returns'],
  ['returns.process', 'returns', 'Process returns'],
  ['delivery.assigned', 'delivery', 'Manage assigned deliveries'],
  ['loyalty.manage', 'loyalty', 'Adjust loyalty points'],
  ['users.manage', 'users', 'Manage users and roles'],
  ['reports.view', 'reports', 'View reports'],
  ['settings.manage', 'settings', 'Manage store settings'],
] as const;

const grants: Record<string, string[]> = {
  admin: permissions.map(([key]) => key),
  manager: [
    'catalog.view',
    'catalog.manage',
    'orders.view',
    'orders.confirm',
    'orders.update',
    'inventory.view',
    'returns.view',
    'returns.process',
    'reports.view',
    'loyalty.manage',
  ],
  purchasing: [
    'purchasing.view',
    'purchasing.manage',
    'inventory.view',
    'catalog.view',
  ],
  warehouse: [
    'inventory.view',
    'inventory.pick',
    'inventory.adjust',
    'inventory.transfer',
    'orders.view',
  ],
  delivery: ['delivery.assigned', 'orders.view'],
  customer: [],
};

const accounts = [
  ['admin', '+9647700000001', 'Development Admin'],
  ['manager', '+9647700000002', 'Development Manager'],
  ['purchasing', '+9647700000003', 'Development Purchasing'],
  ['warehouse', '+9647700000004', 'Development Warehouse'],
  ['delivery', '+9647700000005', 'Development Delivery'],
  ['customer', '+9647700000006', 'Development Customer'],
] as const;

type Department = {
  slug: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  icon: string;
  color: [number, number, number];
  children: ReadonlyArray<readonly [string, string, string]>;
  products: ReadonlyArray<readonly [string, string, number, number]>;
};

const departments: Department[] = [
  {
    slug: 'electronics',
    nameEn: 'Electronics',
    nameAr: 'الإلكترونيات',
    descriptionEn: 'Connected devices and everyday technology',
    descriptionAr: 'أجهزة ذكية وتقنيات للاستخدام اليومي',
    icon: 'electronics',
    color: [35, 99, 235],
    children: [
      ['phones-accessories', 'Phones & Accessories', 'الهواتف وملحقاتها'],
      [
        'audio-wearables',
        'Audio & Wearables',
        'الصوتيات والأجهزة القابلة للارتداء',
      ],
    ],
    products: [
      ['Wireless Earbuds', 'سماعات أذن لاسلكية', 20.15, 1],
      ['Smart Watch', 'ساعة ذكية', 68.5, 1],
      ['USB-C Fast Charger', 'شاحن سريع يو إس بي سي', 18, 0],
      ['Bluetooth Speaker', 'مكبر صوت بلوتوث', 39.75, 1],
    ],
  },
  {
    slug: 'home-garden',
    nameEn: 'Home & Garden',
    nameAr: 'المنزل والحديقة',
    descriptionEn: 'Practical pieces for comfortable homes',
    descriptionAr: 'منتجات عملية لمنزل أكثر راحة',
    icon: 'home_garden',
    color: [22, 163, 74],
    children: [
      ['kitchen-dining', 'Kitchen & Dining', 'المطبخ والسفرة'],
      ['home-organization', 'Home Organization', 'تنظيم المنزل'],
    ],
    products: [
      ['Nonstick Frying Pan', 'مقلاة غير لاصقة', 32.5, 0],
      ['Cotton Bed Sheet', 'شرشف سرير قطني', 27.25, 1],
      ['Storage Basket', 'سلة تخزين', 12, 1],
      ['LED Desk Lamp', 'مصباح مكتب إل إي دي', 22.4, 0],
    ],
  },
  {
    slug: 'fashion',
    nameEn: 'Fashion',
    nameAr: 'الأزياء',
    descriptionEn: 'Everyday clothing and accessories',
    descriptionAr: 'ملابس وإكسسوارات لكل يوم',
    icon: 'fashion',
    color: [219, 39, 119],
    children: [
      ['mens-fashion', "Men's Fashion", 'أزياء رجالية'],
      ['womens-fashion', "Women's Fashion", 'أزياء نسائية'],
    ],
    products: [
      ["Men's Polo Shirt", 'قميص بولو رجالي', 24, 0],
      ["Women's Abaya", 'عباءة نسائية', 55, 1],
      ['Everyday Sneakers', 'حذاء رياضي يومي', 44.9, 0],
      ['Leather Wallet', 'محفظة جلدية', 19.5, 0],
    ],
  },
  {
    slug: 'grocery',
    nameEn: 'Grocery',
    nameAr: 'البقالة',
    descriptionEn: 'Pantry staples and quality ingredients',
    descriptionAr: 'أساسيات المطبخ ومكونات مختارة',
    icon: 'grocery',
    color: [234, 88, 12],
    children: [
      ['pantry', 'Pantry', 'المؤونة'],
      ['drinks-snacks', 'Drinks & Snacks', 'المشروبات والوجبات الخفيفة'],
    ],
    products: [
      ['Basmati Rice 5 kg', 'أرز بسمتي ٥ كغم', 16.75, 0],
      ['Extra Virgin Olive Oil', 'زيت زيتون بكر ممتاز', 14.25, 0],
      ['Premium Black Tea', 'شاي أسود فاخر', 7.5, 1],
      ['Roasted Mixed Nuts', 'مكسرات مشكلة محمصة', 11.8, 1],
    ],
  },
  {
    slug: 'beauty',
    nameEn: 'Beauty',
    nameAr: 'الجمال والعناية',
    descriptionEn: 'Personal care and fragrance essentials',
    descriptionAr: 'أساسيات العناية الشخصية والعطور',
    icon: 'beauty',
    color: [147, 51, 234],
    children: [
      ['skin-care', 'Skin Care', 'العناية بالبشرة'],
      ['hair-fragrance', 'Hair & Fragrance', 'الشعر والعطور'],
    ],
    products: [
      ['Hydrating Face Cream', 'كريم مرطب للوجه', 21.5, 0],
      ['Oud Eau de Parfum', 'عطر عود', 48, 1],
      ['Daily Care Shampoo', 'شامبو للعناية اليومية', 9.75, 1],
      ['Sunscreen SPF 50', 'واقي شمس بدرجة ٥٠', 17.2, 0],
    ],
  },
  {
    slug: 'sports',
    nameEn: 'Sports',
    nameAr: 'الرياضة',
    descriptionEn: 'Equipment for training and active days',
    descriptionAr: 'معدات للتمرين والحياة النشطة',
    icon: 'sports',
    color: [8, 145, 178],
    children: [
      ['fitness', 'Fitness', 'اللياقة البدنية'],
      ['outdoor-sports', 'Outdoor Sports', 'الرياضات الخارجية'],
    ],
    products: [
      ['Yoga Mat', 'بساط يوغا', 18.5, 0],
      ['Football Size 5', 'كرة قدم قياس ٥', 23, 1],
      ['Resistance Band Set', 'مجموعة أحزمة مقاومة', 15.75, 0],
      ['Insulated Water Bottle', 'قنينة ماء عازلة', 13.9, 1],
    ],
  },
  {
    slug: 'automotive',
    nameEn: 'Automotive',
    nameAr: 'السيارات',
    descriptionEn: 'Accessories and maintenance supplies',
    descriptionAr: 'ملحقات ومستلزمات صيانة السيارات',
    icon: 'automotive',
    color: [71, 85, 105],
    children: [
      ['car-accessories', 'Car Accessories', 'إكسسوارات السيارات'],
      ['car-care', 'Car Care', 'العناية بالسيارة'],
    ],
    products: [
      ['Car Phone Holder', 'حامل هاتف للسيارة', 14.5, 0],
      ['Engine Oil 5W-30', 'زيت محرك 5W-30', 29.9, 1],
      ['Microfiber Cleaning Kit', 'عدة تنظيف مايكروفايبر', 12.25, 1],
      ['Portable Tire Inflator', 'منفاخ إطارات محمول', 46, 0],
    ],
  },
  {
    slug: 'books-stationery',
    nameEn: 'Books & Stationery',
    nameAr: 'الكتب والقرطاسية',
    descriptionEn: 'Reading, learning, and planning essentials',
    descriptionAr: 'كتب وأدوات للتعلم والتخطيط',
    icon: 'books',
    color: [180, 83, 9],
    children: [
      ['books', 'Books', 'الكتب'],
      ['stationery', 'Stationery', 'القرطاسية'],
    ],
    products: [
      ['Contemporary Arabic Novel', 'رواية عربية معاصرة', 12, 0],
      ["Children's Science Book", 'كتاب العلوم للأطفال', 10.5, 0],
      ['Business Planner', 'مفكرة أعمال', 8.75, 1],
      ['English-Arabic Dictionary', 'قاموس إنجليزي عربي', 16, 0],
    ],
  },
];

async function main(): Promise<void> {
  await ensureBucket();

  for (const [key, value] of [
    ['store_name', 'Shubayr'],
    ['currency', 'IQD'],
    ['primary_color', '#0B2A54'],
    ['logo_url', ''],
  ] as const) {
    await prisma.storeSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  const roleIds = new Map<string, string>();
  for (const [name, description] of roles) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description, is_system: true },
      create: { name, description, is_system: true },
    });
    roleIds.set(name, role.id);
  }
  const permissionIds = new Map<string, string>();
  for (const [key, group, description] of permissions) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { group, description },
      create: { key, group, description },
    });
    permissionIds.set(key, permission.id);
  }
  for (const [roleName, keys] of Object.entries(grants)) {
    await prisma.rolePermission.createMany({
      data: keys.map((key) => ({
        role_id: roleIds.get(roleName)!,
        permission_id: permissionIds.get(key)!,
      })),
      skipDuplicates: true,
    });
  }

  const users = new Map<string, string>();
  for (const [roleName, phone, name] of accounts) {
    const user = await prisma.user.upsert({
      where: { phone },
      update: { role_id: roleIds.get(roleName)!, name, is_active: true },
      create: { role_id: roleIds.get(roleName)!, phone, name, is_active: true },
    });
    users.set(roleName, user.id);
    await prisma.notificationPreference.upsert({
      where: { user_id: user.id },
      update: {},
      create: { user_id: user.id },
    });
  }

  const secondDeliveryAgent = await prisma.user.upsert({
    where: { phone: '+9647700000007' },
    update: {
      role_id: roleIds.get('delivery')!,
      name: 'Development Delivery B',
      is_active: true,
    },
    create: {
      role_id: roleIds.get('delivery')!,
      phone: '+9647700000007',
      name: 'Development Delivery B',
      is_active: true,
    },
  });

  const adminId = users.get('admin')!;
  const imageUrls: string[] = [];
  for (let index = 0; index < departments.length; index += 1) {
    imageUrls.push(
      await seedImage(
        index + 1,
        departments[index].slug,
        departments[index].color,
        adminId,
      ),
    );
  }
  const promoUrl = await seedImage(9, 'promotion', [220, 38, 38], adminId);
  const secondaryUrl = await seedImage(
    10,
    'catalog-secondary',
    [15, 118, 110],
    adminId,
  );

  const now = new Date();
  const activeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const activeEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const futureStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
  const warehouseId = seedId(9, 1);
  const locationId = seedId(9, 2);
  await prisma.warehouse.upsert({
    where: { id: warehouseId },
    update: { name: 'Main Warehouse', code: 'MAIN', is_active: true },
    create: { id: warehouseId, name: 'Main Warehouse', code: 'MAIN' },
  });
  await prisma.warehouseLocation.upsert({
    where: { id: locationId },
    update: {
      warehouse_id: warehouseId,
      zone: 'A',
      aisle: '01',
      shelf: '01',
      bin: '01',
    },
    create: {
      id: locationId,
      warehouse_id: warehouseId,
      zone: 'A',
      aisle: '01',
      shelf: '01',
      bin: '01',
    },
  });

  let categoryNumber = 1;
  let productNumber = 1;
  for (
    let departmentIndex = 0;
    departmentIndex < departments.length;
    departmentIndex += 1
  ) {
    const department = departments[departmentIndex];
    const rootId = seedId(3, categoryNumber++);
    await prisma.category.upsert({
      where: { id: rootId },
      update: categoryData(
        department,
        imageUrls[departmentIndex],
        departmentIndex,
      ),
      create: {
        id: rootId,
        ...categoryData(
          department,
          imageUrls[departmentIndex],
          departmentIndex,
        ),
      },
    });
    const childIds: string[] = [];
    for (
      let childIndex = 0;
      childIndex < department.children.length;
      childIndex += 1
    ) {
      const [slug, nameEn, nameAr] = department.children[childIndex];
      const childId = seedId(3, categoryNumber++);
      childIds.push(childId);
      const data = {
        parent_id: rootId,
        slug,
        name_en: nameEn,
        name_ar: nameAr,
        description_en: department.descriptionEn,
        description_ar: department.descriptionAr,
        image_url: imageUrls[departmentIndex],
        icon_key: department.icon,
        sort_order: childIndex,
        is_visible: true,
      };
      await prisma.category.upsert({
        where: { id: childId },
        update: data,
        create: { id: childId, ...data },
      });
    }

    for (const [nameEn, nameAr, price, childIndex] of department.products) {
      const number = productNumber++;
      const productId = seedId(4, number);
      const discount =
        number === 1
          ? {
              discount_type: 'percentage',
              discount_value: 50,
              discount_starts_at: activeStart,
              discount_ends_at: activeEnd,
            }
          : number === 2
            ? {
                discount_type: 'percentage',
                discount_value: 15,
                discount_starts_at: futureStart,
                discount_ends_at: futureEnd,
              }
            : {
                discount_type: null,
                discount_value: null,
                discount_starts_at: null,
                discount_ends_at: null,
              };
      const productData = {
        category_id: childIds[childIndex],
        name_en: nameEn,
        name_ar: nameAr,
        description: `${nameEn} from the seeded Shubayr development catalog.`,
        price,
        ...discount,
        is_negotiable: number === 3,
        floor_price: number === 3 ? Math.round(price * 80) / 100 : null,
        points_price: number === 3 ? 250 : null,
        status: 'active',
        tracks_expiry: department.slug === 'grocery',
      };
      await prisma.product.upsert({
        where: { id: productId },
        update: productData,
        create: { id: productId, ...productData },
      });
      await prisma.productImage.upsert({
        where: { id: seedId(6, number * 2 - 1) },
        update: {
          product_id: productId,
          url: imageUrls[departmentIndex],
          sort_order: 0,
        },
        create: {
          id: seedId(6, number * 2 - 1),
          product_id: productId,
          url: imageUrls[departmentIndex],
          sort_order: 0,
        },
      });
      await prisma.productImage.upsert({
        where: { id: seedId(6, number * 2) },
        update: { product_id: productId, url: secondaryUrl, sort_order: 1 },
        create: {
          id: seedId(6, number * 2),
          product_id: productId,
          url: secondaryUrl,
          sort_order: 1,
        },
      });
      for (let variantIndex = 0; variantIndex < 2; variantIndex += 1) {
        const variantNumber = (number - 1) * 2 + variantIndex + 1;
        const variantId = seedId(5, variantNumber);
        const sku = `SEED-${String(number).padStart(3, '0')}-${variantIndex === 0 ? 'STD' : 'PLUS'}`;
        const variant = await prisma.productVariant.upsert({
          where: { sku },
          update: {
            product_id: productId,
            attributes: { option: variantIndex === 0 ? 'standard' : 'plus' },
            price_delta: variantIndex === 0 ? 0 : 3,
          },
          create: {
            id: variantId,
            product_id: productId,
            sku,
            attributes: { option: variantIndex === 0 ? 'standard' : 'plus' },
            price_delta: variantIndex === 0 ? 0 : 3,
          },
        });
        const batchId = seedId(7, variantNumber);
        await prisma.inventoryBatch.upsert({
          where: { id: batchId },
          update: {
            product_id: productId,
            variant_id: variant.id,
            lot_number: `SEED-${number}`,
            purchase_cost: Math.max(1, Math.round(price * 60) / 100),
            qty_received: 100,
          },
          create: {
            id: batchId,
            product_id: productId,
            variant_id: variant.id,
            lot_number: `SEED-${number}`,
            purchase_cost: Math.max(1, Math.round(price * 60) / 100),
            qty_received: 100,
          },
        });
        await prisma.batchStock.upsert({
          where: {
            batch_id_location_id: {
              batch_id: batchId,
              location_id: locationId,
            },
          },
          update: { quantity: 100 },
          create: { batch_id: batchId, location_id: locationId, quantity: 100 },
        });
      }
    }
  }

  const banners = [
    ['Seasonal offers', 'عروض الموسم', promoUrl, 0, activeStart, activeEnd],
    ['Technology essentials', 'أساسيات التقنية', imageUrls[0], 1, null, null],
    ['Home refresh', 'تجديد المنزل', imageUrls[1], 2, futureStart, futureEnd],
  ] as const;
  for (let index = 0; index < banners.length; index += 1) {
    const [title, subtitle, image_url, sort_order, starts_at, ends_at] =
      banners[index];
    const data = {
      title,
      subtitle,
      image_url,
      cta_text: 'Shop now',
      link_url: null,
      sort_order,
      is_active: true,
      starts_at,
      ends_at,
    };
    await prisma.banner.upsert({
      where: { id: seedId(8, index + 1) },
      update: data,
      create: { id: seedId(8, index + 1), ...data },
    });
  }

  await prisma.coupon.upsert({
    where: { code: 'DEV10' },
    update: {
      type: 'percentage',
      value: 10,
      usage_limit: null,
      expires_at: null,
    },
    create: { code: 'DEV10', type: 'percentage', value: 10 },
  });
  await prisma.coupon.upsert({
    where: { code: 'SHUBAYR10' },
    update: {
      type: 'percentage',
      value: 10,
      usage_limit: null,
      expires_at: null,
    },
    create: {
      code: 'SHUBAYR10',
      type: 'percentage',
      value: 10,
      usage_limit: null,
      expires_at: null,
    },
  });
  await seedCustomerOrders(
    users.get('customer')!,
    users.get('delivery')!,
    secondDeliveryAgent.id,
    now,
  );
  await seedPartialReturnDemo(
    users.get('customer')!,
    users.get('admin')!,
    users.get('delivery')!,
    now,
  );
  await seedLoyaltyDemo(
    users.get('customer')!,
    users.get('delivery')!,
    users.get('admin')!,
  );
  await seedProductReviewDemo(users.get('customer')!, users.get('admin')!);

  console.log(
    `Seeded ${roles.length} roles, ${accounts.length + 1} accounts, ${departments.length} departments, ${categoryNumber - 1 - departments.length} subcategories, ${productNumber - 1} products, ${banners.length} banners, and 6 sample orders.`,
  );
}

async function seedProductReviewDemo(
  customerId: string,
  adminId: string,
): Promise<void> {
  const publishedItemId = seedId(1, 33);
  const pendingItemId = seedId(1, 201);
  await prisma.orderItem.update({
    where: { id: publishedItemId },
    data: { reviewed: true },
  });
  await prisma.orderItem.update({
    where: { id: pendingItemId },
    data: { reviewed: true },
  });
  const approved = await prisma.productReview.findUniqueOrThrow({
    where: {
      order_item_id_user_id: {
        order_item_id: publishedItemId,
        user_id: customerId,
      },
    },
  });
  if (!approved.moderated_by) {
    await prisma.productReview.update({
      where: { id: approved.id },
      data: {
        moderated_by: adminId,
        moderated_at: approved.created_at,
        moderation_reason: 'Seeded approved verified purchase',
      },
    });
  }
  const pending = await prisma.productReview.upsert({
    where: {
      order_item_id_user_id: {
        order_item_id: pendingItemId,
        user_id: customerId,
      },
    },
    update: {},
    create: {
      id: seedId(1, 321),
      product_id: seedId(4, 1),
      user_id: customerId,
      order_item_id: pendingItemId,
      rating: 3,
      comment: 'Seeded pending verified review',
      verified_purchase: true,
      status: 'pending',
    },
  });
  await prisma.auditLog.upsert({
    where: { id: seedId(1, 330) },
    update: {},
    create: {
      id: seedId(1, 330),
      actor_id: adminId,
      action: 'product_review.moderate',
      entity_type: 'product_review',
      entity_id: approved.id,
      before: { status: 'pending' },
      after: {
        status: 'published',
        reason: 'Seeded approved verified purchase',
      },
    },
  });
  await prisma.auditLog.upsert({
    where: { id: seedId(1, 331) },
    update: {},
    create: {
      id: seedId(1, 331),
      actor_id: customerId,
      action: 'product_review.create',
      entity_type: 'product_review',
      entity_id: pending.id,
      after: { status: 'pending', verified_purchase: true, seed_demo: true },
    },
  });
  for (const productId of [seedId(4, 1), seedId(4, 4)]) {
    const [rating] = await prisma.$queryRaw<
      Array<{ rating_count: number; rating_avg: number }>
    >`
      SELECT COUNT(*)::integer AS rating_count,
             COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS rating_avg
      FROM product_reviews WHERE product_id = ${productId}::uuid AND status = 'published'`;
    await prisma.product.update({ where: { id: productId }, data: rating });
  }
}

async function seedLoyaltyDemo(
  customerId: string,
  agentId: string,
  adminId: string,
): Promise<void> {
  const account = await prisma.loyaltyAccount.upsert({
    where: { user_id: customerId },
    update: {},
    create: { id: seedId(1, 300), user_id: customerId },
  });
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: seedId(1, 13) },
  });
  const eligible =
    moneyToMinorUnits(order.subtotal) - moneyToMinorUnits(order.discount);
  const earned = Number(eligible > 0n ? eligible / 100n : 0n);
  if (earned < 1)
    throw new Error(
      'Delivered seed order must earn at least one loyalty point',
    );
  const entries = [
    {
      id: seedId(1, 301),
      account_id: account.id,
      order_id: order.id,
      type: 'earn',
      reason: 'order_delivered',
      points: earned,
      created_by: agentId,
      note: 'Seeded earn from delivered order',
    },
    {
      id: seedId(1, 302),
      account_id: account.id,
      order_id: null,
      type: 'redeem',
      reason: 'customer_redemption',
      points: -1,
      created_by: customerId,
      note: 'Seeded points redemption',
    },
  ];
  for (const entry of entries) {
    const existing = await prisma.loyaltyLedger.findUnique({
      where: { id: entry.id },
    });
    if (!existing) await prisma.loyaltyLedger.create({ data: entry });
  }
  for (const [index, action] of ['loyalty.earn', 'loyalty.redeem'].entries()) {
    await prisma.auditLog.upsert({
      where: { id: seedId(1, 303 + index) },
      update: {},
      create: {
        id: seedId(1, 303 + index),
        actor_id: index === 0 ? agentId : customerId,
        action,
        entity_type: 'loyalty_ledger',
        entity_id: entries[index].id,
        after: { seed_demo: true, points: entries[index].points },
      },
    });
  }
  const negotiable = await prisma.product.findUniqueOrThrow({
    where: { id: seedId(4, 3) },
  });
  await prisma.auditLog.upsert({
    where: { id: seedId(1, 305) },
    update: {},
    create: {
      id: seedId(1, 305),
      actor_id: adminId,
      action: 'catalog.negotiation.create',
      entity_type: 'product',
      entity_id: seedId(4, 3),
      after: {
        is_negotiable: true,
        floor_price: Number(negotiable.floor_price),
        points_price: 250,
        seed_demo: true,
      },
    },
  });
}

async function seedPartialReturnDemo(
  customerId: string,
  adminId: string,
  agentId: string,
  now: Date,
): Promise<void> {
  const orderId = seedId(1, 200);
  const returnId = seedId(1, 204);
  const locationId = seedId(9, 2);
  const products = await Promise.all(
    [1, 2].map(async (number) => {
      const product = await prisma.product.findUniqueOrThrow({
        where: { id: seedId(4, number) },
      });
      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { sku: `SEED-${String(number).padStart(3, '0')}-STD` },
      });
      return { product, variant };
    }),
  );
  const prices = products.map(({ product, variant }) =>
    cartUnitPrice(product, variant.price_delta, now),
  );
  const quantities = [3, 1];
  const subtotal = minorUnitsToMoney(
    moneyToMinorUnits(prices[0]) * 3n + moneyToMinorUnits(prices[1]),
  );
  await prisma.order.upsert({
    where: { id: orderId },
    update: {},
    create: {
      id: orderId,
      user_id: customerId,
      address_id: seedId(1, 1),
      order_number: 'DEV-PARTIAL-RETURN',
      status: 'delivered',
      payment_method: 'cod',
      subtotal,
      delivery_fee: 0,
      discount: 0,
      total: subtotal,
      delivery_contact_phone: '+9647700090006',
      delivery_address_label: 'Home',
      delivery_city: 'Baghdad',
      delivery_area: 'Karrada',
      delivery_street: 'Development Street',
      delivery_details: 'Seeded checkout address',
      placed_at: now,
      items: {
        create: products.map(({ product, variant }, index) => ({
          id: seedId(1, 201 + index),
          product_id: product.id,
          variant_id: variant.id,
          product_name_ar: product.name_ar,
          product_name_en: product.name_en,
          quantity: quantities[index],
          unit_price: prices[index],
          line_total: calculateLineTotal(prices[index], quantities[index]),
        })),
      },
      payments: {
        create: {
          id: seedId(1, 212),
          method: 'cod',
          status: 'paid',
          amount: subtotal,
          paid_at: now,
        },
      },
      status_events: {
        create: { id: seedId(1, 213), status: 'delivered', at: now },
      },
    },
  });
  await prisma.delivery.upsert({
    where: { id: seedId(1, 203) },
    update: {},
    create: {
      id: seedId(1, 203),
      order_id: orderId,
      agent_id: agentId,
      status: 'delivered',
      delivery_fee: 0,
      dispatched_at: now,
      delivered_at: now,
    },
  });
  await prisma.order.update({
    where: { id: orderId },
    data: { delivery_id: seedId(1, 203) },
  });
  for (let index = 0; index < products.length; index += 1) {
    await prisma.simpleStockHold.upsert({
      where: { order_item_id: seedId(1, 201 + index) },
      update: {},
      create: {
        id: seedId(1, 210 + index),
        order_id: orderId,
        order_item_id: seedId(1, 201 + index),
        product_id: products[index].product.id,
        variant_id: products[index].variant.id,
        quantity: quantities[index],
      },
    });
  }
  await prisma.stockReservation.upsert({
    where: { id: seedId(1, 209) },
    update: {},
    create: {
      id: seedId(1, 209),
      order_id: orderId,
      order_item_id: seedId(1, 201),
      batch_id: seedId(7, 1),
      location_id: locationId,
      quantity: 3,
      status: 'consumed',
    },
  });
  const refund = minorUnitsToMoney(
    moneyToMinorUnits(prices[0]) + moneyToMinorUnits(prices[1]),
  );
  await prisma.return.upsert({
    where: { id: returnId },
    update: {},
    create: {
      id: returnId,
      order_id: orderId,
      user_id: customerId,
      status: 'completed',
      reason: 'Seeded partial return',
      expected_refund: refund,
      refund_amount: refund,
      reviewed_by: adminId,
      reviewed_at: now,
      completed_at: now,
      created_at: now,
      items: {
        create: [
          {
            id: seedId(1, 205),
            order_item_id: seedId(1, 201),
            quantity: 1,
            approved_quantity: 1,
            customer_reason: 'Unneeded unit',
            unit_price: prices[0],
            condition: 'sellable',
            restock: true,
            batch_id: seedId(7, 1),
          },
          {
            id: seedId(1, 206),
            order_item_id: seedId(1, 202),
            quantity: 1,
            approved_quantity: 1,
            customer_reason: 'Arrived damaged',
            unit_price: prices[1],
            condition: 'damaged',
            restock: false,
          },
        ],
      },
    },
  });
  await prisma.batchStock.upsert({
    where: {
      batch_id_location_id: { batch_id: seedId(7, 1), location_id: locationId },
    },
    update: { quantity: 101 },
    create: { batch_id: seedId(7, 1), location_id: locationId, quantity: 101 },
  });
  await prisma.stockMovement.upsert({
    where: { id: seedId(1, 208) },
    update: {},
    create: {
      id: seedId(1, 208),
      batch_id: seedId(7, 1),
      return_item_id: seedId(1, 205),
      type: 'return_in',
      to_location: locationId,
      quantity: 1,
      reference: `return-origin:${returnId}`,
      user_id: adminId,
    },
  });
  await prisma.refundLedgerEntry.upsert({
    where: { return_id: returnId },
    update: {},
    create: {
      id: seedId(1, 207),
      order_id: orderId,
      return_id: returnId,
      amount: refund,
      status: 'obligation',
      reason: 'Seeded COD refund obligation; no gateway reversal',
      created_by: adminId,
    },
  });
  const actions = [
    'return.request',
    'return.disposition',
    'return.restock',
    'return.disposition',
    'return.review',
    'refund.obligation',
    'return.complete',
  ];
  for (const [index, action] of actions.entries()) {
    await prisma.auditLog.upsert({
      where: { id: seedId(1, 220 + index) },
      update: {},
      create: {
        id: seedId(1, 220 + index),
        actor_id: index === 0 ? customerId : adminId,
        action,
        entity_type:
          action === 'refund.obligation'
            ? 'refund_ledger'
            : action === 'return.restock'
              ? 'stock_movement'
              : action === 'return.disposition'
                ? 'return_item'
                : 'return',
        entity_id:
          action === 'refund.obligation'
            ? seedId(1, 207)
            : action === 'return.restock'
              ? seedId(1, 208)
              : action === 'return.disposition'
                ? seedId(1, index === 1 ? 205 : 206)
                : returnId,
        after: { seed_demo: true, status: 'completed' },
      },
    });
  }
}

async function seedCustomerOrders(
  customerId: string,
  deliveryAgentId: string,
  secondDeliveryAgentId: string,
  now: Date,
): Promise<void> {
  const addressId = seedId(1, 1);
  const existingAddressCount = await prisma.address.count({
    where: { user_id: customerId },
  });
  const address = await prisma.address.upsert({
    where: { id: addressId },
    update: {},
    create: {
      id: addressId,
      user_id: customerId,
      label: 'Home',
      city: 'Baghdad',
      area: 'Karrada',
      street: 'Development Street',
      details: 'Seeded checkout address',
      contact_phone: '+9647700090006',
      is_default: existingAddressCount === 0,
    },
  });

  const samples = [
    {
      status: 'pending',
      timeline: ['pending'],
      product: 1,
      daysAgo: 0,
      quantity: 2,
    },
    {
      status: 'confirmed',
      timeline: ['pending', 'confirmed'],
      product: 2,
      daysAgo: 1,
      quantity: 1,
    },
    {
      status: 'out_for_delivery',
      timeline: ['pending', 'confirmed', 'processing', 'out_for_delivery'],
      product: 3,
      daysAgo: 3,
      quantity: 1,
    },
    {
      status: 'delivered',
      timeline: [
        'pending',
        'confirmed',
        'processing',
        'out_for_delivery',
        'delivered',
      ],
      product: 4,
      daysAgo: 7,
      quantity: 1,
    },
    {
      status: 'failed_delivery',
      timeline: [
        'pending',
        'confirmed',
        'processing',
        'out_for_delivery',
        'failed_delivery',
      ],
      product: 5,
      daysAgo: 5,
      quantity: 1,
    },
  ] as const;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const id = seedId(1, 10 + index);
    const placedAt = new Date(
      now.getTime() - sample.daysAgo * 86_400_000 - 3_600_000,
    );
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: seedId(4, sample.product) },
      include: { images: { orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] } },
    });
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { sku: `SEED-${String(sample.product).padStart(3, '0')}-STD` },
    });
    const unitPrice = cartUnitPrice(product, variant.price_delta, placedAt);
    const lineTotal = calculateLineTotal(unitPrice, sample.quantity);
    const itemId = seedId(1, 30 + index);
    let order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) {
      order = await prisma.order.create({
        data: {
          id,
          user_id: customerId,
          address_id: address.id,
          order_number: `DEV-ORDER-${index + 1}`,
          status: sample.status,
          payment_method: 'cod',
          subtotal: lineTotal,
          delivery_fee: 0,
          discount: 0,
          total: lineTotal,
          placed_at: placedAt,
          delivery_contact_phone: address.contact_phone,
          delivery_address_label: address.label,
          delivery_city: address.city,
          delivery_area: address.area,
          delivery_street: address.street,
          delivery_details: address.details,
          delivery_lat: address.lat,
          delivery_lng: address.lng,
          items: {
            create: {
              id: itemId,
              product_id: product.id,
              variant_id: variant.id,
              product_name_ar: product.name_ar,
              product_name_en: product.name_en,
              image_url: product.images[0]?.url ?? null,
              quantity: sample.quantity,
              unit_price: unitPrice,
              line_total: lineTotal,
            },
          },
          payments: {
            create: {
              id: seedId(1, 40 + index),
              method: 'cod',
              status: sample.status === 'delivered' ? 'paid' : 'pending',
              amount: lineTotal,
              paid_at:
                sample.status === 'delivered'
                  ? new Date(placedAt.getTime() + 5 * 3_600_000)
                  : null,
            },
          },
          status_events: {
            create: sample.timeline.map((status, eventIndex) => ({
              id: seedId(1, 100 + index * 10 + eventIndex),
              status,
              at: new Date(placedAt.getTime() + eventIndex * 3_600_000),
            })),
          },
        },
        include: { items: true },
      });
    }
    const dispatched = (sample.timeline as readonly string[]).includes(
      'out_for_delivery',
    );
    const delivered = sample.status === 'delivered';
    const delivery = await prisma.delivery.upsert({
      where: { id: seedId(1, 20 + index) },
      update: {},
      create: {
        id: seedId(1, 20 + index),
        order_id: id,
        agent_id: index === 1 ? secondDeliveryAgentId : deliveryAgentId,
        status: delivered
          ? 'delivered'
          : sample.status === 'failed_delivery'
            ? 'failed'
            : dispatched
              ? 'out_for_delivery'
              : 'assigned',
        delivery_fee: 0,
        dispatched_at: dispatched
          ? new Date(placedAt.getTime() + 3 * 3_600_000)
          : null,
        delivered_at: delivered
          ? new Date(placedAt.getTime() + 4 * 3_600_000)
          : null,
      },
    });
    await prisma.delivery.updateMany({
      where: { id: delivery.id, agent_id: null },
      data: { agent_id: index === 1 ? secondDeliveryAgentId : deliveryAgentId },
    });
    if (!order.delivery_id) {
      await prisma.order.update({
        where: { id },
        data: { delivery_id: delivery.id },
      });
    }
    for (const item of order.items) {
      await prisma.simpleStockHold.upsert({
        where: { order_item_id: item.id },
        update: {},
        create: {
          id: seedId(1, 70 + index),
          order_id: id,
          order_item_id: item.id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
        },
      });
    }
    if (delivered && order.items[0]) {
      const deliveredItem = order.items[0];
      await prisma.productReview.upsert({
        where: {
          order_item_id_user_id: {
            order_item_id: deliveredItem.id,
            user_id: customerId,
          },
        },
        update: {},
        create: {
          id: seedId(1, 80),
          product_id: deliveredItem.product_id,
          user_id: customerId,
          order_item_id: deliveredItem.id,
          rating: 5,
          comment: 'Seeded delivered-order review',
          verified_purchase: true,
          status: 'published',
        },
      });
      await prisma.deliveryRating.upsert({
        where: { delivery_id: delivery.id },
        update: {},
        create: {
          id: seedId(1, 90),
          delivery_id: delivery.id,
          agent_id: deliveryAgentId,
          user_id: customerId,
          stars: 5,
          comment: 'Seeded delivery rating',
        },
      });
    }
  }
}

function categoryData(
  department: Department,
  imageUrl: string,
  sortOrder: number,
) {
  return {
    parent_id: null,
    slug: department.slug,
    name_en: department.nameEn,
    name_ar: department.nameAr,
    description_en: department.descriptionEn,
    description_ar: department.descriptionAr,
    image_url: imageUrl,
    icon_key: department.icon,
    sort_order: sortOrder,
    is_visible: true,
  };
}

async function seedImage(
  index: number,
  slug: string,
  color: [number, number, number],
  uploadedBy: string,
): Promise<string> {
  const id = seedId(2, index);
  const objectKey = `seed/${slug}.png`;
  const publicUrl = `${publicApiUrl}/media/${id}`;
  const body = png(color);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: body,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  await prisma.mediaObject.upsert({
    where: { id },
    update: {
      object_key: objectKey,
      public_url: publicUrl,
      mime_type: 'image/png',
      size_bytes: body.length,
      checksum: createHash('sha256').update(body).digest('hex'),
      uploaded_by: uploadedBy,
    },
    create: {
      id,
      object_key: objectKey,
      public_url: publicUrl,
      mime_type: 'image/png',
      size_bytes: body.length,
      checksum: createHash('sha256').update(body).digest('hex'),
      uploaded_by: uploadedBy,
    },
  });
  return publicUrl;
}

async function ensureBucket(): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      return;
    } catch {
      try {
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
        return;
      } catch (error) {
        if (attempt === 30) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}

function png([red, green, blue]: [number, number, number]): Buffer {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0, red, green, blue]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return chunk;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function seedId(group: number, number: number): string {
  return `${group}0000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to seed`);
  return value;
}

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
      s3.destroy();
    });
}
