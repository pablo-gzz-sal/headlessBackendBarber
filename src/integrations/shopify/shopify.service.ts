import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateGiftCardDto } from './dto/gift-card.dto';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { CreateSmartCollectionDto } from './dto/smart-collection.dto';
import { CreateMetafieldDto } from './dto/metafield.dto';
import { brandKeyFromTitle } from '../../helpers/brandKey';

@Injectable()
export class ShopifyService {
  private shopify;
  private session;
  private readonly logger = new Logger(ShopifyService.name);

  private requestQueue: Promise<any> = Promise.resolve();
  private lastRequestAt = 0;
  private readonly minRequestGapMs = 600;

  constructor(private configService: ConfigService) {
    const shopDomain = this.configService.get<string>('SHOPIFY_STORE_DOMAIN');
    const accessToken = this.configService.get<string>('SHOPIFY_ACCESS_TOKEN');

    if (!shopDomain) {
      throw new Error(
        'SHOPIFY_STORE_DOMAIN is not configured in environment variables',
      );
    }

    if (!accessToken) {
      throw new Error(
        'SHOPIFY_ACCESS_TOKEN is not configured in environment variables',
      );
    }

    this.logger.log(`Initializing Shopify with domain: ${shopDomain}`);

    try {
      this.shopify = shopifyApi({
        apiKey: 'not-used-for-custom-app',
        apiSecretKey: 'not-used-for-custom-app',
        scopes: [
          'read_products',
          'write_orders',
          'read_orders',
          'read_customers',
          'write_customers',
          'read_gift_cards',
          'write_gift_cards',
        ],
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
      this.logger.error(
        '❌ Failed to initialize Shopify service:',
        error.message,
      );
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

      this.logger.log(
        `Fetching products with params: ${JSON.stringify(params)}`,
      );

      const response = await client.get({ path: 'products', query: params });
      const products = response.body['products'] || [];

      return { products, count: products.length };
    } catch (error) {
      this.logger.error('Failed to fetch products:', error.message);
      throw new InternalServerErrorException(
        'Failed to fetch products from Shopify',
      );
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
      const term = (query || '').trim();

      if (!term) {
        return { products: [], count: 0 };
      }

      this.logger.log(`Searching products with query: ${term}`);

      const shopDomain = this.configService.get<string>('SHOPIFY_STORE_DOMAIN');
      const accessToken = this.configService.get<string>(
        'SHOPIFY_ACCESS_TOKEN',
      );

      if (!shopDomain || !accessToken) {
        throw new Error('Missing Shopify configuration');
      }

      const normalizedDomain = shopDomain
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');

      const endpoint = `https://${normalizedDomain}/admin/api/2026-01/graphql.json`;

      const safeTerm = term.replace(/["\\]/g, ' ').trim();

      const graphqlQuery = `
      query SearchProducts($first: Int!, $query: String!) {
        products(first: $first, query: $query, sortKey: RELEVANCE) {
          edges {
            node {
              id
              legacyResourceId
              title
              handle
              vendor
              tags
              productType
              featuredImage {
                url
                altText
              }
              images(first: 1) {
                edges {
                  node {
                    url
                    altText
                  }
                }
              }
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                    compareAtPrice
                  }
                }
              }
            }
          }
        }
      }
    `;

      const searchQuery = [
        `status:active`,
        `(title:*${safeTerm}* OR vendor:*${safeTerm}* OR tag:*${safeTerm}* OR product_type:*${safeTerm}*)`,
      ].join(' AND ');

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: {
            first: limit,
            query: searchQuery,
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`Shopify search failed: ${response.status} ${text}`);
        throw new Error(`Shopify GraphQL error: ${response.status}`);
      }

      const json = await response.json();

      if (json.errors?.length) {
        this.logger.error(
          `Shopify GraphQL errors: ${JSON.stringify(json.errors)}`,
        );
        throw new Error('Shopify GraphQL returned errors');
      }

      const edges = json?.data?.products?.edges ?? [];

      const products = edges.map((edge: any) => {
        const node = edge.node;
        const firstImage = node?.images?.edges?.[0]?.node;
        const firstVariant = node?.variants?.edges?.[0]?.node;

        return {
          id: String(node?.legacyResourceId ?? node?.id),
          title: node?.title ?? '',
          handle: node?.handle ?? '',
          vendor: node?.vendor ?? '',
          tags: node?.tags ?? [],
          product_type: node?.productType ?? '',
          image: {
            src: node?.featuredImage?.url ?? firstImage?.url ?? '',
            alt:
              node?.featuredImage?.altText ??
              firstImage?.altText ??
              node?.title ??
              '',
          },
          variants: firstVariant
            ? [
                {
                  id: firstVariant.id,
                  price: firstVariant.price,
                  compare_at_price: firstVariant.compareAtPrice,
                },
              ]
            : [],
          price: firstVariant?.price ?? null,
        };
      });

      return {
        products,
        count: products.length,
      };
    } catch (error: any) {
      this.logger.error('Failed to search products:', error?.message || error);
      throw new InternalServerErrorException('Failed to search products');
    }
  }

  // ==================== COLLECTIONS ====================

  async getCollections(query: CollectionQueryDto) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      const limit = query.limit || 200;
      const params: any = { limit };

      this.logger.log(`Fetching collections`);

      const [customRes, smartRes] = await Promise.all([
        client.get({ path: 'custom_collections', query: params }),
        client.get({ path: 'smart_collections', query: params }),
      ]);

      const custom = customRes.body?.custom_collections ?? [];
      const smart = smartRes.body?.smart_collections ?? [];

      const rawCollections = [
        ...custom.map((c: any) => ({ ...c, collection_type: 'custom' })),
        ...smart.map((c: any) => ({ ...c, collection_type: 'smart' })),
      ];

      const allCollections = await Promise.all(
        rawCollections.map(async (c: any) => {
          const metafields = await this.getCollectionImageMetafields(
            String(c.id),
            c.collection_type,
          );

          return {
            id: String(c.id),
            title: c.title,
            handle: c.handle,
            image: c.image,
            collection_type: c.collection_type,
            brandKey: brandKeyFromTitle(c),

            // expose all metafields too in case frontend wants the raw array
            metafields,

            // flattened fields for easier frontend usage
            brandImage: this.getMetafieldValue(metafields, 'brandImage'),
            footerBrand: this.getMetafieldValue(metafields, 'footerBrand'),
            overviewCollection: this.getMetafieldValue(
              metafields,
              'overviewCollection',
            ),
          };
        }),
      );

      const grouped = allCollections.reduce((acc: any, c: any) => {
        acc[c.brandKey] ??= {
          brandKey: c.brandKey,
          brandTitle: c.title.split(/[-|:–—]/)[0].trim(),
          collections: [],
        };

        acc[c.brandKey].collections.push(c);
        return acc;
      }, {});

      const brandGroups = Object.values(grouped).map((g: any) => {
        const heroCollection =
          g.collections.find((x: any) => x.brandImage) ??
          g.collections.find((x: any) => x.footerBrand) ??
          g.collections.find((x: any) => x.image) ??
          g.collections[0];

        return {
          brandKey: g.brandKey,
          brandTitle: g.brandTitle,
          hero: heroCollection,
          collectionIds: g.collections.map((x: any) => x.id),
          collectionHandles: g.collections.map((x: any) => x.handle),
          collectionTitles: g.collections.map((x: any) => x.title),

          // useful for grouped brand pages
          collectionImages: g.collections.map(
            (x: any) => x.overviewCollection || x.image?.src || '',
          ),

          count: g.collections.length,
        };
      });

      return {
        collections: allCollections,
        brandGroups,
        count: allCollections.length,
      };
    } catch (error: any) {
      this.logger.error(
        'Failed to fetch collections:',
        error?.message ?? error,
      );
      throw new InternalServerErrorException('Failed to fetch collections');
    }
  }

  private async getCollectionImageMetafields(
    collectionId: string,
    collectionType: 'custom' | 'smart',
  ) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      const resource =
        collectionType === 'smart' ? 'smart_collection' : 'custom_collection';

      const res = await client.get({
        path: 'metafields',
        query: {
          owner_id: collectionId,
          owner_resource: resource,
        },
      });

      const metafields = res.body?.metafields ?? [];

      return metafields.filter((m: any) =>
        ['brandImage', 'footerBrand', 'overviewCollection'].includes(m.key),
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to fetch metafields for collection ${collectionId}: ${error?.message ?? error}`,
      );
      return [];
    }
  }

  private getMetafieldValue(metafields: any[], key: string): string {
    const found = metafields.find((m: any) => m?.key === key);
    return found?.value ?? '';
  }
  async getCollectionById(collectionId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(`Fetching collection with ID: ${collectionId}`);

      const response = await client.get({
        path: `custom_collections/${collectionId}`,
      });

      if (!response.body['custom_collection']) {
        throw new NotFoundException(
          `Collection with ID ${collectionId} not found`,
        );
      }

      return response.body['custom_collection'];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Failed to fetch collection:', error.message);
      throw new InternalServerErrorException(
        'Failed to fetch collection details',
      );
    }
  }

  // async getCollectionProducts(collectionId: string, limit: number = 50) {
  //   try {
  //     const client = new this.shopify.clients.Rest({ session: this.session });

  //     this.logger.log(`Fetching products for collection: ${collectionId}`);

  //     const response = await client.get({
  //       path: `collections/${collectionId}/products`,
  //       query: { limit },
  //     });

  //     this.logger.log(`MIAUUU`);

  //     const products = (response.body['products'] || []).map((p: any) => ({
  //       ...p,
  //       price: p?.variants?.[0]?.price ?? null,
  //     }));
  //     this.logger.log(JSON.stringify(products[0], null, 2));
  //     return { products, count: products.length };
  //   } catch (error) {
  //     this.logger.error('Failed to fetch collection products:', error.message);
  //     throw new InternalServerErrorException(
  //       'Failed to fetch collection products',
  //     );
  //   }
  // }

async getCollectionProducts(collectionId: string, limit: number = 50) {
  try {
    const client = new this.shopify.clients.Rest({ session: this.session });

    this.logger.log(`Fetching products for collection: ${collectionId}`);

    const response = await this.enqueueShopifyRequest(() =>
      client.get({
        path: `collections/${collectionId}/products`,
        query: { limit },
      }),
    );

    const products = (response as any).body['products'] || [];
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

      this.logger.log(
        `Fetching customers with params: ${JSON.stringify(params)}`,
      );

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
      throw new InternalServerErrorException(
        'Failed to fetch customer details',
      );
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

  async updateCustomer(
    customerId: string,
    customerData: Partial<CreateCustomerDto>,
  ) {
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
      throw new InternalServerErrorException(
        'Failed to fetch customer segments',
      );
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
        throw new NotFoundException(
          `Gift card with ID ${giftCardId} not found`,
        );
      }

      return response.body['gift_card'];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Failed to fetch gift card:', error.message);
      throw new InternalServerErrorException(
        'Failed to fetch gift card details',
      );
    }
  }

  async createGiftCard(giftCardData: CreateGiftCardDto) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(
        `Creating gift card with value: ${giftCardData.initial_value}`,
      );

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

  // ==================== PRODUCT RECOMMENDATIONS ====================

  /**
   * Get product recommendations using Shopify's built-in recommendation engine
   */
  async getProductRecommendations(query: RecommendationQueryDto) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(
        `Fetching recommendations for product: ${query.productId}`,
      );

      const response = await client.get({
        path: `products/${query.productId}/recommendations`,
        query: { limit: query.limit || 4 },
      });

      const recommendations = response.body['products'] || [];
      return {
        recommendations,
        count: recommendations.length,
        source: 'shopify_recommendations',
      };
    } catch (error) {
      this.logger.error('Failed to fetch recommendations:', error.message);
      // Fallback to related products if recommendations fail
      return this.getRelatedProducts(query.productId, query.limit);
    }
  }

  /**
   * Get related products (fallback when recommendations are not available)
   * Uses same collection and similar tags
   */
  async getRelatedProducts(productId: string, limit: number = 4) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      // First, get the product details
      const productResponse = await client.get({
        path: `products/${productId}`,
      });

      const product = productResponse.body['product'];
      if (!product) {
        throw new NotFoundException(`Product with ID ${productId} not found`);
      }

      // Get products from the same product type or with similar tags
      const relatedResponse = await client.get({
        path: 'products',
        query: {
          product_type: product.product_type,
          limit: limit + 1, // Get one extra to exclude current product
        },
      });

      let relatedProducts = relatedResponse.body['products'] || [];

      // Exclude the current product
      relatedProducts = relatedProducts.filter((p) => p.id !== product.id);

      // Limit results
      relatedProducts = relatedProducts.slice(0, limit);

      return {
        recommendations: relatedProducts,
        count: relatedProducts.length,
        source: 'related_products',
      };
    } catch (error) {
      this.logger.error('Failed to fetch related products:', error.message);
      throw new InternalServerErrorException(
        'Failed to fetch related products',
      );
    }
  }

  // ==================== SMART COLLECTIONS ====================

  /**
   * Get all smart collections (auto-updating collections based on rules)
   */
  async getSmartCollections(limit: number = 50) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(`Fetching smart collections with limit: ${limit}`);

      const response = await client.get({
        path: 'smart_collections',
        query: { limit },
      });

      const smartCollections = response.body['smart_collections'] || [];
      return { smartCollections, count: smartCollections.length };
    } catch (error) {
      this.logger.error('Failed to fetch smart collections:', error.message);
      throw new InternalServerErrorException(
        'Failed to fetch smart collections',
      );
    }
  }

  /**
   * Get smart collection by ID
   */
  async getSmartCollectionById(collectionId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(`Fetching smart collection with ID: ${collectionId}`);

      const response = await client.get({
        path: `smart_collections/${collectionId}`,
      });

      if (!response.body['smart_collection']) {
        throw new NotFoundException(
          `Smart collection with ID ${collectionId} not found`,
        );
      }

      return response.body['smart_collection'];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Failed to fetch smart collection:', error.message);
      throw new InternalServerErrorException(
        'Failed to fetch smart collection details',
      );
    }
  }

  /**
   * Create a smart collection with automated rules
   */
  async createSmartCollection(collectionData: CreateSmartCollectionDto) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(`Creating smart collection: ${collectionData.title}`);

      const response = await client.post({
        path: 'smart_collections',
        data: {
          smart_collection: {
            title: collectionData.title,
            body_html: collectionData.body_html,
            rules: collectionData.rules,
            disjunctive: collectionData.disjunctive || false,
            sort_order: collectionData.sort_order || 'best-selling',
            published: collectionData.published !== false,
          },
        },
      });

      return response.body['smart_collection'];
    } catch (error) {
      this.logger.error('Failed to create smart collection:', error.message);
      if (error.response?.body?.errors) {
        throw new BadRequestException(error.response.body.errors);
      }
      throw new InternalServerErrorException(
        'Failed to create smart collection',
      );
    }
  }

  /**
   * Update a smart collection
   */
  async updateSmartCollection(
    collectionId: string,
    collectionData: Partial<CreateSmartCollectionDto>,
  ) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(`Updating smart collection: ${collectionId}`);

      const response = await client.put({
        path: `smart_collections/${collectionId}`,
        data: { smart_collection: collectionData },
      });

      return response.body['smart_collection'];
    } catch (error) {
      this.logger.error('Failed to update smart collection:', error.message);
      throw new InternalServerErrorException(
        'Failed to update smart collection',
      );
    }
  }

  /**
   * Delete a smart collection
   */
  async deleteSmartCollection(collectionId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(`Deleting smart collection: ${collectionId}`);

      await client.delete({
        path: `smart_collections/${collectionId}`,
      });

      return {
        success: true,
        message: `Smart collection ${collectionId} deleted successfully`,
      };
    } catch (error) {
      this.logger.error('Failed to delete smart collection:', error.message);
      throw new InternalServerErrorException(
        'Failed to delete smart collection',
      );
    }
  }

  // ==================== FEATURED/CURATED COLLECTIONS ====================

  /**
   * Get collection by handle (user-friendly URL)
   */
async getCollectionByHandle(handle: string) {
try {
  const client = new this.shopify.clients.Rest({ session: this.session });

  this.logger.log(`Fetching collection with handle: ${handle}`);

  let response = await this.enqueueShopifyRequest(() =>
    client.get({
      path: 'custom_collections',
      query: { handle },
    }),
  );

  let collections = (response as any).body['custom_collections'] || [];

    if (collections.length === 0) {
      response = await this.enqueueShopifyRequest(() =>
        client.get({
          path: 'smart_collections',
          query: { handle },
        }),
      );

      collections = (response as any).body['smart_collections'] || [];
    }

    if (collections.length === 0) {
      throw new NotFoundException(`Collection with handle '${handle}' not found`);
    }

    return collections[0];
  } catch (error) {
    if (error instanceof NotFoundException) throw error;
    this.logger.error('Failed to fetch collection by handle:', error.message);
    throw new InternalServerErrorException('Failed to fetch collection');
  }
}

  /**
   * Get products from multiple collections (for homepage sections)
   */
  async getProductsFromMultipleCollections(
    collectionHandles: string[],
    limitPerCollection: number = 4,
  ) {
    try {
      const results = {};

      for (const handle of collectionHandles) {
        try {
          const collection = await this.getCollectionByHandle(handle);
          const products = await this.getCollectionProducts(
            collection.id.toString(),
            limitPerCollection,
          );

          results[handle] = {
            collection: {
              id: collection.id,
              title: collection.title,
              handle: collection.handle,
            },
            products: products.products,
            count: products.count,
          };
        } catch (error) {
          this.logger.warn(
            `Failed to fetch collection ${handle}:`,
            error.message,
          );
          results[handle] = {
            collection: null,
            products: [],
            count: 0,
            error: error.message,
          };
        }
      }

      return results;
    } catch (error) {
      this.logger.error(
        'Failed to fetch products from multiple collections:',
        error.message,
      );
      throw new InternalServerErrorException(
        'Failed to fetch featured products',
      );
    }
  }

  // ==================== PRODUCT TAGS ====================
  async getProductsByTag(tag: string, limit: number = 50) {
    try {
      const client = new this.shopify.clients.Graphql({
        session: this.session,
      });

      const normalizedTag = (tag ?? '').trim();
      if (!normalizedTag) throw new BadRequestException('Tag is required');

      const target = Math.max(1, Number(limit) || 50);
      const pageSize = Math.min(250, target);

      const gql = `
      query ProductsByTag($first: Int!, $after: String, $query: String!) {
        products(first: $first, after: $after, query: $query) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              handle
              tags
              vendor
              status
              featuredImage { url altText }
              variants(first: 1) {
                edges { node { id price } }
              }
            }
          }
        }
      }
    `;

      // Shopify product search syntax
      const query = `tag:${normalizedTag}`;

      const products: any[] = [];
      let after: string | null = null;

      this.logger.log(
        `GraphQL: fetching products with ${query} (target=${target})`,
      );

      while (products.length < target) {
        const variables = {
          first: Math.min(pageSize, target - products.length),
          after,
          query,
        };

        // ✅ v12+ uses request(), NOT query()
        const resp: any = await client.request(gql, { variables });

        const data = resp?.data ?? resp?.body?.data; // be tolerant across setups
        const edges = data?.products?.edges ?? [];

        for (const e of edges) products.push(e.node);

        const pageInfo = data?.products?.pageInfo;
        if (!pageInfo?.hasNextPage) break;

        after = pageInfo.endCursor;
        if (!after) break;
      }

      return { products, count: products.length };
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch products by tag "${tag}": ${error?.message}`,
        error?.stack,
      );
      throw new InternalServerErrorException('Failed to fetch products by tag');
    }
  }
  /**
   * Get products by tag (useful for filtering)
   */
  // async getProductsByTag(tag: string, limit: number = 50) {
  //   try {
  //     const client = new this.shopify.clients.Rest({ session: this.session });

  //     this.logger.log(`Fetching products with tag: ${tag}`);

  //     const response = await client.get({
  //       path: 'products',
  //       query: {
  //         limit,
  //         // Shopify doesn't directly support tag filtering in REST API
  //         // We'll fetch and filter
  //       },
  //     });

  //     let products = response.body['products'] || [];

  //     // Filter by tag
  //     products = products.filter(
  //       (product) =>
  //         product.tags &&
  //         product.tags.toLowerCase().includes(tag.toLowerCase()),
  //     );

  //     return { products, count: products.length };
  //   } catch (error) {
  //     this.logger.error('Failed to fetch products by tag:', error.message);
  //     throw new InternalServerErrorException('Failed to fetch products by tag');
  //   }
  // }

  // ==================== METAFIELDS (For Custom Data) ====================

  /**
   * Get metafields for a product (useful for custom featured product lists)
   */
  async getProductMetafields(productId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(`Fetching metafields for product: ${productId}`);

      const response = await client.get({
        path: `products/${productId}/metafields`,
      });

      const metafields = response.body['metafields'] || [];
      return { metafields, count: metafields.length };
    } catch (error) {
      this.logger.error('Failed to fetch product metafields:', error.message);
      throw new InternalServerErrorException(
        'Failed to fetch product metafields',
      );
    }
  }

  /**
   * Create metafield for a product
   */
  async createProductMetafield(
    productId: string,
    metafieldData: CreateMetafieldDto,
  ) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(`Creating metafield for product: ${productId}`);

      const response = await client.post({
        path: `products/${productId}/metafields`,
        data: { metafield: metafieldData },
      });

      return response.body['metafield'];
    } catch (error) {
      this.logger.error('Failed to create product metafield:', error.message);
      throw new InternalServerErrorException(
        'Failed to create product metafield',
      );
    }
  }

  // ==================== BESTSELLERS ====================

  /**
   * Get bestselling products
   * Note: Shopify doesn't provide direct bestseller data via REST API
   * This uses order data to calculate bestsellers
   */
  async getBestsellers(limit: number = 10, days: number = 30) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(`Calculating bestsellers for last ${days} days`);

      // Calculate date range
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Fetch recent orders
      const ordersResponse = await client.get({
        path: 'orders',
        query: {
          status: 'any',
          limit: 250,
          created_at_min: startDate.toISOString(),
        },
      });

      const orders = ordersResponse.body['orders'] || [];

      // Count product sales
      const productSales = {};

      orders.forEach((order) => {
        order.line_items?.forEach((item) => {
          const productId = item.product_id?.toString();
          if (productId) {
            if (!productSales[productId]) {
              productSales[productId] = {
                product_id: productId,
                quantity_sold: 0,
                revenue: 0,
              };
            }
            productSales[productId].quantity_sold += item.quantity;
            productSales[productId].revenue +=
              parseFloat(item.price) * item.quantity;
          }
        });
      });

      // Sort by quantity sold
      const sortedProducts = Object.values(productSales)
        .sort((a: any, b: any) => b.quantity_sold - a.quantity_sold)
        .slice(0, limit);

      // Fetch full product details
      const bestsellers = await Promise.all(
        sortedProducts.map(async (item: any) => {
          try {
            const product = await this.getProductById(item.product_id);
            return {
              ...product,
              sales_data: {
                quantity_sold: item.quantity_sold,
                revenue: item.revenue,
              },
            };
          } catch (error) {
            this.logger.warn(
              `Failed to fetch product ${item.product_id}:`,
              error.message,
            );
            return null;
          }
        }),
      );

      return {
        bestsellers: bestsellers.filter((p) => p !== null),
        count: bestsellers.filter((p) => p !== null).length,
        period: `${days} days`,
      };
    } catch (error) {
      this.logger.error('Failed to calculate bestsellers:', error.message);
      throw new InternalServerErrorException('Failed to calculate bestsellers');
    }
  }

  // ==================== SALE ====================

  /**
   * Get sale products (variant.compare_at_price > variant.price)
   */
  async getSaleProducts(limit = 20, minDiscount = 0, brand?: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      const normalizedBrand = String(brand ?? '')
        .trim()
        .toLowerCase();

      const res = await client.get({
        path: 'products',
        query: { limit: 250, status: 'active' },
      });

      const products = res.body['products'] ?? [];

      const sale = products
        .filter((p: any) => {
          if (!normalizedBrand) return true;

          const handle = String(p?.handle ?? '')
            .trim()
            .toLowerCase();

          const firstPart = handle.split('-')[0];
          return firstPart === normalizedBrand;
        })
        .map((p: any) => {
          const variants = Array.isArray(p?.variants) ? p.variants : [];

          let bestDiscountPct = -1;
          let bestPrice: number | null = null;
          let bestCompareAt: number | null = null;

          for (const v of variants) {
            const price = Number(v?.price);
            const compareAt = Number(v?.compare_at_price);

            if (!Number.isFinite(price) || !Number.isFinite(compareAt))
              continue;
            if (compareAt <= price) continue;

            const pct = ((compareAt - price) / compareAt) * 100;

            if (pct > bestDiscountPct) {
              bestDiscountPct = pct;
              bestPrice = price;
              bestCompareAt = compareAt;
            }
          }

          if (bestDiscountPct < 0) return null;
          if (bestDiscountPct < minDiscount) return null;

          return {
            ...p,
            sale_data: {
              best_price: bestPrice,
              best_compare_at_price: bestCompareAt,
              discount_percent: Number(bestDiscountPct.toFixed(2)),
            },
          };
        })
        .filter(Boolean)
        .sort(
          (a: any, b: any) =>
            (b.sale_data?.discount_percent ?? 0) -
            (a.sale_data?.discount_percent ?? 0),
        )
        .slice(0, limit);

      return {
        sale,
        count: sale.length,
        minDiscount,
        brand: normalizedBrand || null,
        source: 'compare_at_price',
      };
    } catch (error) {
      this.logger.error('Failed to fetch sale products:', error.message);
      throw new InternalServerErrorException('Failed to fetch sale products');
    }
  }

  // ==================== VARIANTS ====================

  async getProductVariants(productId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(`Fetching variants for product ID: ${productId}`);

      const response = await client.get({ path: `products/${productId}` });

      const product = response.body['product'];
      if (!product) {
        throw new NotFoundException(`Product with ID ${productId} not found`);
      }

      const variants = product.variants || [];

      // Return a clean DTO-like shape for frontend
      return {
        productId: String(product.id),
        count: variants.length,
        variants: variants.map((v) => ({
          id: String(v.id),
          title: v.title,
          price: v.price,
          sku: v.sku,
          option1: v.option1,
          option2: v.option2,
          option3: v.option3,
          inventory_quantity: v.inventory_quantity,
          image_id: v.image_id,
          admin_graphql_api_id: v.admin_graphql_api_id,
        })),
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Failed to fetch product variants:', error.message);
      throw new InternalServerErrorException(
        'Failed to fetch product variants',
      );
    }
  }

  async getVariantById(variantId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(`Fetching variant by ID: ${variantId}`);

      // Shopify REST supports: GET /variants/{variant_id}.json
      const response = await client.get({ path: `variants/${variantId}` });

      const variant = response.body['variant'];
      if (!variant) {
        throw new NotFoundException(`Variant with ID ${variantId} not found`);
      }

      return variant;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Failed to fetch variant:', error.message);
      throw new InternalServerErrorException('Failed to fetch variant details');
    }
  }

  /**
   * Resolve a variantId for a product by matching option1 (or title).
   * Example: option1="7.1 BLONDE ASH"
   */
  async resolveVariantId(productId: string, option1?: string, title?: string) {
    if (!option1 && !title) {
      throw new BadRequestException(
        'Provide option1 or title to resolve variant',
      );
    }

    const data = await this.getProductVariants(productId);

    const found = data.variants.find((v) => {
      const matchOption = option1
        ? String(v.option1) === String(option1)
        : false;
      const matchTitle = title ? String(v.title) === String(title) : false;
      return matchOption || matchTitle;
    });

    if (!found) {
      throw new NotFoundException(
        `No variant found for product ${productId} using option1/title`,
      );
    }

    return {
      productId: String(productId),
      variantId: String(found.id),
      title: found.title,
      price: found.price,
    };
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isThrottleError(error: any): boolean {
    const message = String(error?.message ?? '').toLowerCase();
    const status =
      error?.response?.status ?? error?.statusCode ?? error?.status;

    return (
      status === 429 ||
      message.includes('throttl') ||
      message.includes('exceeded 2 calls per second')
    );
  }

  private async enqueueShopifyRequest<T>(
    fn: () => Promise<T>,
    attempt = 1,
  ): Promise<T> {
    const run = async () => {
      const now = Date.now();
      const waitMs = Math.max(
        0,
        this.minRequestGapMs - (now - this.lastRequestAt),
      );

      if (waitMs > 0) {
        await this.sleep(waitMs);
      }

      this.lastRequestAt = Date.now();

      try {
        return await fn();
      } catch (error) {
        if (this.isThrottleError(error) && attempt <= 4) {
          const backoff = 800 * attempt;
          this.logger.warn(
            `Shopify throttled request. Retrying in ${backoff}ms (attempt ${attempt})`,
          );
          await this.sleep(backoff);
          return this.enqueueShopifyRequest(fn, attempt + 1);
        }

        throw error;
      }
    };

    const next = this.requestQueue.then(run, run);
    this.requestQueue = next.then(
      () => undefined,
      () => undefined,
    );

    return next;
  }
}
