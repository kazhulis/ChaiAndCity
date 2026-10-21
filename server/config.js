import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const shippingCountries = (process.env.SHIPPING_COUNTRIES || process.env.SHIPPING_COUNTRY || 'LV')
  .split(',')
  .map((country) => country.trim().toUpperCase())
  .filter(Boolean);

if (!shippingCountries.length || shippingCountries.some((country) => !/^[A-Z]{2}$/.test(country))) {
  throw new Error('SHIPPING_COUNTRIES must contain comma-separated ISO 3166-1 alpha-2 country codes.');
}

// Who supplies shipping rates, pickup points and shipments: 'makecommerce' (default) or 'swotzy'.
const shippingProvider = (process.env.SHIPPING_PROVIDER || 'makecommerce').toLowerCase();
if (!['makecommerce', 'swotzy'].includes(shippingProvider)) throw new Error('SHIPPING_PROVIDER must be makecommerce or swotzy.');

export const config = {
  shippingProvider,
  port: Number(process.env.PORT || 3001),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  woocommerce: {
    enabled: process.env.WOOCOMMERCE_ENABLED === 'true',
    url: process.env.WOOCOMMERCE_URL,
    consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET,
    paymentMethod: process.env.WOOCOMMERCE_PAYMENT_METHOD || undefined,
  },
  makecommerce: {
    enabled: process.env.MAKECOMMERCE_ENABLED === 'true',
    shopId: process.env.MAKECOMMERCE_SHOP_ID,
    secretKey: process.env.MAKECOMMERCE_SECRET_KEY,
    apiUrl: process.env.MAKECOMMERCE_API_URL
      || (process.env.MAKECOMMERCE_TEST === 'false' ? 'https://api.maksekeskus.ee' : 'https://api.test.maksekeskus.ee'),
    shippingEnabled: process.env.MAKECOMMERCE_SHIPPING_ENABLED === 'true',
    shippingApiUrl: process.env.MAKECOMMERCE_SHIPPING_API_URL
      || (process.env.MAKECOMMERCE_TEST === 'false' ? 'https://shipping.makecommerce.net' : 'https://shipping.test.makecommerce.net'),
    shippingManagerUrl: process.env.MAKECOMMERCE_SHIPPING_MANAGER_URL
      || (process.env.MAKECOMMERCE_TEST === 'false' ? 'https://shipping-manager.makecommerce.net' : 'https://shipping-manager.test.makecommerce.net'),
    shopInstance: process.env.MAKECOMMERCE_SHOP_INSTANCE || 'chaiandcity-web',
    shippingSetupToken: process.env.MAKECOMMERCE_SHIPPING_SETUP_TOKEN,
    country: shippingCountries[0],
    shippingCountries: [...new Set(shippingCountries)],
    itemWeightGrams: Number(process.env.ITEM_WEIGHT_GRAMS || 100),
    publicApiUrl: (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, ''),
  },
  swotzy: {
    enabled: process.env.SWOTZY_ENABLED === 'true',
    apiUrl: process.env.SWOTZY_API_URL || 'https://api.swotzy.com/public',
    // HTTP Basic credentials: apiUser + apiToken (or SWOTZY_API_TOKEN as "user:password").
    apiUser: process.env.SWOTZY_API_USER || '',
    apiToken: process.env.SWOTZY_API_TOKEN,
    currency: process.env.SWOTZY_CURRENCY || 'EUR',
    rateZip: process.env.SWOTZY_RATE_ZIP || '',
    // Overrides only; anything left empty is read from the WooCommerce store settings.
    sender: {
      full_name: process.env.SWOTZY_SENDER_NAME,
      company: process.env.SWOTZY_SENDER_COMPANY || null,
      phone: process.env.SWOTZY_SENDER_PHONE,
      email: process.env.SWOTZY_SENDER_EMAIL,
      address1: process.env.SWOTZY_SENDER_ADDRESS,
      zip: process.env.SWOTZY_SENDER_ZIP,
      city: process.env.SWOTZY_SENDER_CITY,
      country: process.env.SWOTZY_SENDER_COUNTRY,
    },
    package: {
      length: Number(process.env.SWOTZY_PACKAGE_LENGTH_CM || 20),
      width: Number(process.env.SWOTZY_PACKAGE_WIDTH_CM || 15),
      height: Number(process.env.SWOTZY_PACKAGE_HEIGHT_CM || 10),
    },
  },
  webhookSecrets: {
    woocommerce: process.env.WOOCOMMERCE_WEBHOOK_SECRET,
    payment: process.env.PAYMENT_WEBHOOK_SECRET,
  },
};

export function assertProductionConfig() {
  if (config.makecommerce.enabled) {
    required('MAKECOMMERCE_SHOP_ID');
    required('MAKECOMMERCE_SECRET_KEY');
  }
  if (config.nodeEnv !== 'production') return;
  if (config.woocommerce.enabled) {
    required('WOOCOMMERCE_URL');
    required('WOOCOMMERCE_CONSUMER_KEY');
    required('WOOCOMMERCE_CONSUMER_SECRET');
  }
  if (config.swotzy.enabled) {
    required('SWOTZY_API_URL');
    required('SWOTZY_API_TOKEN');
  }
}
