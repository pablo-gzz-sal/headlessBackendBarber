import { Injectable, InternalServerErrorException, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateGiftCardDto } from './dto/gift-card.dto';

@Injectable()
export class ShopifyService {
  private shopify;
  private session;
  private readonly logger = new Logger(ShopifyService.name);

  constructor(private configService: ConfigService) {
    const shopDomain = this.configService.get<string>('SHOPIFY_STORE_DOMAIN');
    const accessToken = this.configService.get<string>('SHOPIFY_ACCESS_TOKEN');

    if (!shopDomain) {
      throw new Error('SHOPIFY_STORE_DOMAIN is not configured in environment variables');
    }
    
    if (!accessToken) {
      throw new Error('SHOPIFY_ACCESS_TOKEN is not configured in environment variables');
    }

    this.logger.log(`Initializing Shopify with domain: ${shopDomain}`);

    try {
      this.shopify = shopifyApi({
        apiKey: 'not-used-for-custom-app',
        apiSecretKey: 'not-used-for-custom-app',
        scopes: ['read_products', 'write_orders', 'read_orders', 'read_customers', 'write_customers', 'read_gift_cards', 'write_gift_cards'],
        hostName: shopDomain.replace('https://', '').replace('http://', ''),
        apiVersion: ApiVersion.October23,
        isCustomStoreApp: true,
        isEmbeddedApp: false,
        adminApiAccessToken: accessToken,
      });

      this.session = this.shopify.session.customAppSession(shopDomain);
      this.session.accessToken = accessToken;

      this.logger.log('✅ Shopify service initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Shopify service:', error.message);
      throw error;
    }
  }

  // ==================== PRODUCTS ====================

  async getProducts(query: ProductQueryDto) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      const params: any = { limit: query.limit || 10 };

      if (query.status) params.status = query.status;
      if (query.collectionId) params.collection_id = query.collectionId;

      this.logger.log(`Fetching products with params: ${JSON.stringify(params)}`);

      const response = await client.get({ path: 'products', query: params });
      const products = response.body['products'] || [];

      return { products, count: products.length };
    } catch (error) {
      this.logger.error('Failed to fetch products:', error.message);
      throw new InternalServerErrorException('Failed to fetch products from Shopify');
    }
  }

  async getProductById(productId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Fetching product with ID: ${productId}`);

      const response = await client.get({ path: `products/${productId}` });

      if (!response.body['product']) {
        throw new NotFoundException(`Product with ID ${productId} not found`);
      }

      return response.body['product'];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Failed to fetch product:', error.message);
      throw new InternalServerErrorException('Failed to fetch product details');
    }
  }

  async searchProducts(query: string, limit: number = 20) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Searching products with query: ${query}`);

      const response = await client.get({
        path: 'products',
        query: {
          limit,
          title: query,
        },
      });

      const products = response.body['products'] || [];
      return { products, count: products.length };
    } catch (error) {
      this.logger.error('Failed to search products:', error.message);
      throw new InternalServerErrorException('Failed to search products');
    }
  }

  // ==================== COLLECTIONS ====================

  async getCollections(query: CollectionQueryDto) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      const params: any = { limit: query.limit || 50 };
      if (query.title) params.title = query.title;

      this.logger.log(`Fetching collections with params: ${JSON.stringify(params)}`);

      const response = await client.get({
        path: 'custom_collections',
        query: params,
      });

      const collections = response.body['custom_collections'] || [];
      return { collections, count: collections.length };
    } catch (error) {
      this.logger.error('Failed to fetch collections:', error.message);
      throw new InternalServerErrorException('Failed to fetch collections');
    }
  }

  async getCollectionById(collectionId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Fetching collection with ID: ${collectionId}`);

      const response = await client.get({
        path: `custom_collections/${collectionId}`,
      });

      if (!response.body['custom_collection']) {
        throw new NotFoundException(`Collection with ID ${collectionId} not found`);
      }

      return response.body['custom_collection'];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Failed to fetch collection:', error.message);
      throw new InternalServerErrorException('Failed to fetch collection details');
    }
  }

  async getCollectionProducts(collectionId: string, limit: number = 50) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Fetching products for collection: ${collectionId}`);

      const response = await client.get({
        path: `collections/${collectionId}/products`,
        query: { limit },
      });

      const products = response.body['products'] || [];
      return { products, count: products.length };
    } catch (error) {
      this.logger.error('Failed to fetch collection products:', error.message);
      throw new InternalServerErrorException('Failed to fetch collection products');
    }
  }

  // ==================== CUSTOMERS ====================

  async getCustomers(query: CustomerQueryDto) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      const params: any = { limit: query.limit || 50 };
      if (query.email) params.email = query.email;
      if (query.phone) params.phone = query.phone;

      this.logger.log(`Fetching customers with params: ${JSON.stringify(params)}`);

      const response = await client.get({
        path: 'customers',
        query: params,
      });

      const customers = response.body['customers'] || [];
      return { customers, count: customers.length };
    } catch (error) {
      this.logger.error('Failed to fetch customers:', error.message);
      throw new InternalServerErrorException('Failed to fetch customers');
    }
  }

  async getCustomerById(customerId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Fetching customer with ID: ${customerId}`);

      const response = await client.get({
        path: `customers/${customerId}`,
      });

      if (!response.body['customer']) {
        throw new NotFoundException(`Customer with ID ${customerId} not found`);
      }

      return response.body['customer'];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Failed to fetch customer:', error.message);
      throw new InternalServerErrorException('Failed to fetch customer details');
    }
  }

  async createCustomer(customerData: CreateCustomerDto) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Creating customer: ${customerData.email}`);

      const response = await client.post({
        path: 'customers',
        data: { customer: customerData },
      });

      return response.body['customer'];
    } catch (error) {
      this.logger.error('Failed to create customer:', error.message);
      if (error.response?.body?.errors) {
        throw new BadRequestException(error.response.body.errors);
      }
      throw new InternalServerErrorException('Failed to create customer');
    }
  }

  async updateCustomer(customerId: string, customerData: Partial<CreateCustomerDto>) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Updating customer: ${customerId}`);

      const response = await client.put({
        path: `customers/${customerId}`,
        data: { customer: customerData },
      });

      return response.body['customer'];
    } catch (error) {
      this.logger.error('Failed to update customer:', error.message);
      throw new InternalServerErrorException('Failed to update customer');
    }
  }

  async getCustomerOrders(customerId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Fetching orders for customer: ${customerId}`);

      const response = await client.get({
        path: `customers/${customerId}/orders`,
      });

      const orders = response.body['orders'] || [];
      return { orders, count: orders.length };
    } catch (error) {
      this.logger.error('Failed to fetch customer orders:', error.message);
      throw new InternalServerErrorException('Failed to fetch customer orders');
    }
  }

  // ==================== CUSTOMER SEGMENTS ====================

  async getCustomerSegments() {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log('Fetching customer segments');

      const response = await client.get({
        path: 'customer_saved_searches',
      });

      const segments = response.body['customer_saved_searches'] || [];
      return { segments, count: segments.length };
    } catch (error) {
      this.logger.error('Failed to fetch customer segments:', error.message);
      throw new InternalServerErrorException('Failed to fetch customer segments');
    }
  }

  // ==================== GIFT CARDS ====================

  async getGiftCards(limit: number = 50) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Fetching gift cards with limit: ${limit}`);

      const response = await client.get({
        path: 'gift_cards',
        query: { limit },
      });

      const giftCards = response.body['gift_cards'] || [];
      return { giftCards, count: giftCards.length };
    } catch (error) {
      this.logger.error('Failed to fetch gift cards:', error.message);
      throw new InternalServerErrorException('Failed to fetch gift cards');
    }
  }

  async getGiftCardById(giftCardId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Fetching gift card with ID: ${giftCardId}`);

      const response = await client.get({
        path: `gift_cards/${giftCardId}`,
      });

      if (!response.body['gift_card']) {
        throw new NotFoundException(`Gift card with ID ${giftCardId} not found`);
      }

      return response.body['gift_card'];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Failed to fetch gift card:', error.message);
      throw new InternalServerErrorException('Failed to fetch gift card details');
    }
  }

  async createGiftCard(giftCardData: CreateGiftCardDto) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Creating gift card with value: ${giftCardData.initial_value}`);

      const response = await client.post({
        path: 'gift_cards',
        data: { gift_card: giftCardData },
      });

      return response.body['gift_card'];
    } catch (error) {
      this.logger.error('Failed to create gift card:', error.message);
      throw new InternalServerErrorException('Failed to create gift card');
    }
  }

  async disableGiftCard(giftCardId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      this.logger.log(`Disabling gift card: ${giftCardId}`);

      const response = await client.post({
        path: `gift_cards/${giftCardId}/disable`,
      });

      return response.body['gift_card'];
    } catch (error) {
      this.logger.error('Failed to disable gift card:', error.message);
      throw new InternalServerErrorException('Failed to disable gift card');
    }
  }

  // ==================== ORDERS ====================

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
      throw new InternalServerErrorException('Failed to create order');
    }
  }

  async getOrders(limit = 50, status?: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      const params: any = { limit };
      if (status) params.status = status;

      this.logger.log(`Fetching orders with params: ${JSON.stringify(params)}`);

      const response = await client.get({
        path: 'orders',
        query: params,
      });

      const orders = response.body['orders'] || [];
      return { orders, count: orders.length };
    } catch (error) {
      this.logger.error('Failed to fetch orders:', error.message);
      throw new InternalServerErrorException('Failed to fetch orders');
    }
  }

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
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Failed to fetch order:', error.message);
      throw new InternalServerErrorException('Failed to fetch order details');
    }
  }

  // ==================== HEALTH CHECK ====================

  async healthCheck() {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      const response = await client.get({ path: 'shop' });

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