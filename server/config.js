import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
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
