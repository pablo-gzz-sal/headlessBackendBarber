import { Injectable, InternalServerErrorException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class ShopifyService {
  private shopify;
  private session;
  private readonly logger = new Logger(ShopifyService.name);

  constructor(private configService: ConfigService) {
    const shopDomain = this.configService.get<string>('SHOPIFY_STORE_DOMAIN');
    const accessToken = this.configService.get<string>('SHOPIFY_ACCESS_TOKEN');

    // Validate required environment variables
    if (!shopDomain) {
      throw new Error('SHOPIFY_STORE_DOMAIN is not configured in environment variables');
    }
    
    if (!accessToken) {
      throw new Error('SHOPIFY_ACCESS_TOKEN is not configured in environment variables');
    }

    this.logger.log(`Initializing Shopify with domain: ${shopDomain}`);

    try {
      // Initialize Shopify API with proper configuration
      this.shopify = shopifyApi({
        apiKey: 'not-used-for-custom-app', // Not required for custom apps
        apiSecretKey: 'not-used-for-custom-app', // Not required for custom apps
        scopes: ['read_products', 'write_orders', 'read_orders'],
        hostName: shopDomain.replace('https://', '').replace('http://', ''),
        apiVersion: ApiVersion.October23, // Use a specific API version
        isCustomStoreApp: true,
        isEmbeddedApp: false,
        adminApiAccessToken: accessToken, // This is the key property that was missing!
      });

      // Create session for making API calls
      this.session = this.shopify.session.customAppSession(shopDomain);
      this.session.accessToken = accessToken;

      this.logger.log('✅ Shopify service initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Shopify service:', error.message);
      throw error;
    }
  }

  /**
   * Fetch all products with optional filters
   */
  async getProducts(query: ProductQueryDto) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      const params: any = {
        limit: query.limit || 10,
      };

      if (query.status) {
        params.status = query.status;
      }

      if (query.collectionId) {
        params.collection_id = query.collectionId;
      }

      this.logger.log(`Fetching products with params: ${JSON.stringify(params)}`);

      const response = await client.get({
        path: 'products',
        query: params,
      });

      const products = response.body['products'] || [];

      return {
        products: products,
        count: products.length,
      };
    } catch (error) {
      this.logger.error('Failed to fetch products:', error.message);
      this.logger.error('Error details:', error);
      throw new InternalServerErrorException('Failed to fetch products from Shopify');
    }
  }

  /**
   * Get a single product by ID
   */
  async getProductById(productId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Fetching product with ID: ${productId}`);

      const response = await client.get({
        path: `products/${productId}`,
      });

      if (!response.body['product']) {
        throw new NotFoundException(`Product with ID ${productId} not found`);
      }

      return response.body['product'];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to fetch product:', error.message);
      throw new InternalServerErrorException('Failed to fetch product details');
    }
  }

  /**
   * Get all collections
   */
  async getCollections(limit = 50) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Fetching collections with limit: ${limit}`);

      const response = await client.get({
        path: 'custom_collections',
        query: { limit },
      });

      const collections = response.body['custom_collections'] || [];

      return {
        collections: collections,
        count: collections.length,
      };
    } catch (error) {
      this.logger.error('Failed to fetch collections:', error.message);
      throw new InternalServerErrorException('Failed to fetch collections');
    }
  }

  /**
   * Create a new order
   */
  async createOrder(orderData: CreateOrderDto) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Creating order for: ${orderData.email}`);

      const response = await client.post({
        path: 'orders',
        data: {
          order: {
            email: orderData.email,
            line_items: orderData.line_items,
            shipping_address: orderData.shipping_address,
            financial_status: 'pending',
          },
        },
      });

      return response.body['order'];
    } catch (error) {
      this.logger.error('Failed to create order:', error.message);
      this.logger.error('Error details:', error.response?.body || error);
      throw new InternalServerErrorException('Failed to create order');
    }
  }

  /**
   * Get orders
   */
  async getOrders(limit = 50, status?: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      const params: any = { limit };
      if (status) {
        params.status = status;
      }

      this.logger.log(`Fetching orders with params: ${JSON.stringify(params)}`);

      const response = await client.get({
        path: 'orders',
        query: params,
      });

      const orders = response.body['orders'] || [];

      return {
        orders: orders,
        count: orders.length,
      };
    } catch (error) {
      this.logger.error('Failed to fetch orders:', error.message);
      throw new InternalServerErrorException('Failed to fetch orders');
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Fetching order with ID: ${orderId}`);

      const response = await client.get({
        path: `orders/${orderId}`,
      });

      if (!response.body['order']) {
        throw new NotFoundException(`Order with ID ${orderId} not found`);
      }

      return response.body['order'];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to fetch order:', error.message);
      throw new InternalServerErrorException('Failed to fetch order details');
    }
  }

  /**
   * Health check to verify Shopify connection
   */
  async healthCheck() {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      // Try to fetch shop info as a health check
      const response = await client.get({
        path: 'shop',
      });

      return {
        status: 'connected',
        shop: response.body['shop'],
        message: 'Successfully connected to Shopify',
      };
    } catch (error) {
      this.logger.error('Health check failed:', error.message);
      return {
        status: 'disconnected',
        message: 'Failed to connect to Shopify',
        error: error.message,
      };
    }
  }
}