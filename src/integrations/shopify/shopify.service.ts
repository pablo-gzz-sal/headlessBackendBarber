import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';

@Injectable()
export class ShopifyService {
  private shopifyClient;

  constructor(private configService: ConfigService) {
    const shopDomain = this.configService.get<string>('SHOPIFY_STORE_DOMAIN');
    const accessToken = this.configService.get<string>('SHOPIFY_ACCESS_TOKEN');

    // this.shopifyClient = shopifyApi({
    //   apiVersion: ApiVersion.July24, // use the latest stable version
    //   isCustomStoreApp: true,
    //   storeUrl: shopDomain,
    //   accessToken: accessToken,
    // });
  }

  async getProducts(limit = 10) {
    try {
      const response = await this.shopifyClient.rest.Product.all({ limit });
      return response.data;
    } catch (error) {
      console.error('Shopify error:', error);
      throw new InternalServerErrorException('Failed to fetch products from Shopify');
    }
  }

  async getProductById(productId: string) {
    try {
      const response = await this.shopifyClient.rest.Product.find({ id: productId });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch product details');
    }
  }
}
