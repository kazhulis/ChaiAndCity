import { config } from './config.js';
import { MakeCommerceShippingService } from './services/makecommerceShippingService.js';

function shippingManagerUrl(jwt) {
  const shippingHost = new URL(config.makecommerce.shippingApiUrl).hostname;
  const managerHost = shippingHost === 'shipping.test.makecommerce.net'
    ? 'https://shipping-manager.test.makecommerce.net'
    : 'https://shipping-manager.makecommerce.net';
  const url = new URL('/public/ui/', managerHost);
  url.searchParams.set('jwt', jwt);
  url.searchParams.set('locale', 'en');
  return url.toString();
}

async function main() {
  const { shopId, secretKey } = config.makecommerce;
  if (!shopId || !secretKey) throw new Error('Set MAKECOMMERCE_SHOP_ID and MAKECOMMERCE_SECRET_KEY before running shipping setup.');

  const remoteAddress = process.argv[2] || config.frontendUrl;
  let shopUrl;
  try {
    shopUrl = new URL(remoteAddress);
  } catch {
    throw new Error('Pass the public shop URL as an argument or set FRONTEND_URL.');
  }
  if (shopUrl.protocol !== 'https:' || shopUrl.hostname === 'localhost') {
    throw new Error('Shipping setup requires the public HTTPS shop URL.');
  }

  const response = await new MakeCommerceShippingService().connectShop(shopUrl.origin);
  if (typeof response?.jwt !== 'string' || !response.jwt) {
    throw new Error('MakeCommerce connected the shop but did not return a Shipping Manager token.');
  }

  console.log('Open this one-time MakeCommerce Shipping Manager link and save the sender address and carrier settings:');
  console.log(shippingManagerUrl(response.jwt));
  console.log('After saving the setup, retry checkout to load the delivery rates.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
