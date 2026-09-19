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

  console.log(
    `Seeded ${roles.length} roles, ${accounts.length} accounts, ${departments.length} departments, ${categoryNumber - 1 - departments.length} subcategories, ${productNumber - 1} products, and ${banners.length} banners.`,
  );
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
