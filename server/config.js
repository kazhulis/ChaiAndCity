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

export const config = {
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
    shopInstance: process.env.MAKECOMMERCE_SHOP_INSTANCE || 'chaiandcity-web',
    country: shippingCountries[0],
    shippingCountries: [...new Set(shippingCountries)],
    itemWeightGrams: Number(process.env.ITEM_WEIGHT_GRAMS || 100),
    publicApiUrl: (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, ''),
  },
  swotzy: {
    enabled: process.env.SWOTZY_ENABLED === 'true',
    apiUrl: process.env.SWOTZY_API_URL,
    apiToken: process.env.SWOTZY_API_TOKEN,
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
