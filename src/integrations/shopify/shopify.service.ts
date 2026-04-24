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
import { log } from 'console';

// ---------------------------------------------------------------------------
// Simple TTL cache — avoids repeated expensive Shopify calls within a window
// ---------------------------------------------------------------------------
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache {
  private store = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

@Injectable()
export class ShopifyService {
  private shopify;
  private session;
  private readonly logger = new Logger(ShopifyService.name);

  private requestQueue: Promise<any> = Promise.resolve();
  private lastRequestAt = 0;
  private readonly minRequestGapMs = 550; // slightly under 600 for headroom

  // Cache TTLs — tune these to your update frequency
  private readonly cache = new TtlCache();
  private readonly CACHE_TTL = {
    collections: 5 * 60 * 1000, // 5 min  — brand/collection data rarely changes
    sale: 3 * 60 * 1000, // 3 min  — sale products
    bestsellers: 5 * 60 * 1000, // 5 min  — order-based, expensive to compute
    products: 2 * 60 * 1000, // 2 min  — per-collection product lists
  };

  // Max simultaneous metafield fetches — 2 keeps us safely under 2 req/s
  private readonly METAFIELD_CONCURRENCY = 2;

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
          'read_metafields',
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

  async getProductById(productId: string) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      this.logger.log(`Fetching product with ID: ${productId}`);

      const [productResponse, metafieldsResponse] = await Promise.all([
        client.get({ path: `products/${productId}` }),
        client.get({ path: `products/${productId}/metafields` }),
      ]);

      if (!productResponse.body['product']) {
        throw new NotFoundException(`Product with ID ${productId} not found`);
      }

      const product = productResponse.body['product'];
      const metafields: any[] = metafieldsResponse.body['metafields'] ?? [];

      const metafieldMap = metafields.reduce(
        (acc, mf) => {
          acc[mf.key] = mf.value;
          return acc;
        },
        {} as Record<string, string>,
      );

      // Media (images + videos) only available via GraphQL
      const media = await this.getProductMedia(productId);

      return { ...product, metafields: metafieldMap, media };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Failed to fetch product:', error.message);
      throw new InternalServerErrorException('Failed to fetch product details');
    }
  }

  private async getProductMedia(productId: string): Promise<any[]> {
    try {
      const shopDomain = this.configService.get<string>('SHOPIFY_STORE_DOMAIN');
      const accessToken = this.configService.get<string>(
        'SHOPIFY_ACCESS_TOKEN',
      );

      const normalizedDomain = shopDomain!
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');

      const endpoint = `https://${normalizedDomain}/admin/api/2026-01/graphql.json`;

      const query = `
      query getProductMedia($id: ID!) {
        product(id: $id) {
          media(first: 20) {
            edges {
              node {
                mediaContentType
                ... on MediaImage {
                  id
                  image { url altText width height }
                  preview { image { url } }
                }
                ... on Video {
                  id
                  sources { url mimeType format height width }
                  preview { image { url } }
                }
                ... on ExternalVideo {
                  id
                  embeddedUrl
                  preview { image { url } }
                }
              }
            }
          }
        }
      }
    `;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken!,
        },
        body: JSON.stringify({
          query,
          variables: { id: `gid://shopify/Product/${productId}` },
        }),
      });

      const json = await response.json();

      if (json.errors?.length) {
        this.logger.warn(
          `GraphQL media errors: ${JSON.stringify(json.errors)}`,
        );
        return [];
      }

      const edges = json?.data?.product?.media?.edges ?? [];

      return edges
        .map((edge: any) => {
          const node = edge.node;
          const type = node.mediaContentType; // IMAGE | VIDEO | EXTERNAL_VIDEO

          if (type === 'IMAGE') {
            return {
              media_type: 'image',
              src: node.image?.url ?? '',
              alt: node.image?.altText ?? '',
              width: node.image?.width,
              height: node.image?.height,
              preview_image: {
                src: node.preview?.image?.url ?? node.image?.url ?? '',
              },
            };
          }

          if (type === 'VIDEO') {
            // Prefer mp4, fallback to first available
            const mp4 = node.sources?.find(
              (s: any) => s.mimeType === 'video/mp4',
            );
            const best = mp4 ?? node.sources?.[0];
            return {
              media_type: 'video',
              src: best?.url ?? '',
              sources: node.sources ?? [],
              preview_image: { src: node.preview?.image?.url ?? '' },
            };
          }

          if (type === 'EXTERNAL_VIDEO') {
            return {
              media_type: 'external_video',
              src: node.embeddedUrl ?? '',
              preview_image: { src: node.preview?.image?.url ?? '' },
            };
          }

          return null;
        })
        .filter(Boolean);
    } catch (error: any) {
      // Non-fatal — product still loads, just without media
      this.logger.warn(`Failed to fetch product media: ${error?.message}`);
      return [];
    }
  }

  // ==================== COLLECTIONS ====================

  async getCollections(query: CollectionQueryDto) {
    const cacheKey = 'collections:all';
    const cached = this.cache.get<any>(cacheKey);
    if (cached) {
      this.logger.log('getCollections: cache hit');
      return cached;
    }

    try {
      const shopDomain = this.configService.get<string>('SHOPIFY_STORE_DOMAIN');
      const accessToken = this.configService.get<string>(
        'SHOPIFY_ACCESS_TOKEN',
      );

      if (!shopDomain || !accessToken) {
        throw new Error(
          'Missing Shopify configuration (SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN)',
        );
      }

      const normalizedDomain = shopDomain
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
      const endpoint = `https://${normalizedDomain}/admin/api/2024-10/graphql.json`;

      const limit = query.limit || 200;
      let allCollections: any[] = [];
      let hasNextPage = true;
      let cursor: string | null = null;

      while (hasNextPage && allCollections.length < limit) {
        const batchSize = Math.min(50, limit - allCollections.length);
        const afterClause = cursor ? `, after: "${cursor}"` : '';

        const graphqlQuery = `
        {
          collections(first: ${batchSize}${afterClause}) {
            edges {
              cursor
              node {
                id
                legacyResourceId
                title
                handle
                image {
                  url
                  altText
                  width
                  height
                }
                ruleSet {
                  rules { column relation condition }
                }
                metafields(first: 10, namespace: "custom") {
                  edges {
                    node {
                      namespace
                      key
                      value
                      type
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({ query: graphqlQuery }),
        });

        const json = await response.json();

        if (json.errors?.length) {
          this.logger.error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
          throw new Error('Shopify GraphQL returned errors');
        }

        const edges = json?.data?.collections?.edges ?? [];

        for (const edge of edges) {
          const node = edge.node;
          const hasRuleSet = node.ruleSet?.rules?.length > 0;

          const rawMetafields = (node.metafields?.edges ?? []).map(
            (e: any) => e.node,
          );
          const metafields = rawMetafields.filter((m: any) =>
            ['bannerimage', 'footerbrand', 'overviewcollection', 'whywelove'].includes(
              m.key?.toLowerCase(),
            ),
          );

          allCollections.push({
            id: String(node.legacyResourceId),
            title: node.title,
            handle: node.handle,
            image: node.image
              ? {
                  src: node.image.url,
                  alt: node.image.altText,
                  width: node.image.width,
                  height: node.image.height,
                }
              : null,
            collection_type: hasRuleSet ? 'smart' : 'custom',
            brandKey: brandKeyFromTitle(node),
            metafields,
            bannerImage: this.getMetafieldValue(metafields, 'bannerimage'),
            footerBrand: this.getMetafieldValue(metafields, 'footerbrand'),
            overviewCollection: this.getMetafieldValue(
              metafields,
              'overviewcollection',
            ),
            whyWeLove: this.getMetafieldValue(metafields, 'whywelove'),
          });

          cursor = edge.cursor;
        }

        hasNextPage = json?.data?.collections?.pageInfo?.hasNextPage ?? false;
      }

      this.logger.log(
        `Fetched ${allCollections.length} collections via GraphQL`,
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
          g.collections.find((x: any) => x.bannerImage) ??
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
          collectionImages: g.collections.map(
            (x: any) => x.overviewCollection || x.image?.src || '',
          ),
          count: g.collections.length,
        };
      });

      const result = {
        collections: allCollections,
        brandGroups,
        count: allCollections.length,
      };
      this.cache.set(cacheKey, result, this.CACHE_TTL.collections);
      this.logger.log(
        `getCollections: cached ${allCollections.length} collections for 5 min`,
      );

      return result;
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

      const path =
        collectionType === 'smart'
          ? `smart_collections/${collectionId}/metafields`
          : `custom_collections/${collectionId}/metafields`;

      const res = await this.enqueueShopifyRequest(() => client.get({ path }));

      const metafields = (res as any).body?.metafields ?? [];

      // ✅ Log EVERYTHING — no filter
      this.logger.log(
        `Collection ${collectionId} RAW metafields (${metafields.length}): ${JSON.stringify(metafields)}`,
      );
      return metafields.filter((m: any) =>
        ['bannerimage', 'footerbrand', 'overviewcollection'].includes(m.key),
      );
    } catch (error: any) {
      // ✅ Log the FULL error, not just the message
      this.logger.warn(
        `Failed to fetch metafields for collection ${collectionId}:`,
        error,
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

      // Try custom first, fall back to smart
      let collection: any = null;
      let collectionType: 'custom' | 'smart' = 'custom';

      try {
        const response = await this.enqueueShopifyRequest(() =>
          client.get({ path: `custom_collections/${collectionId}` }),
        );
        collection = (response as any).body?.custom_collection;
      } catch {
        const response = await this.enqueueShopifyRequest(() =>
          client.get({ path: `smart_collections/${collectionId}` }),
        );
        collection = (response as any).body?.smart_collection;
        collectionType = 'smart';
      }

      if (!collection) {
        throw new NotFoundException(
          `Collection with ID ${collectionId} not found`,
        );
      }

      // Fetch metafields using your existing method
      const metafields = await this.getCollectionImageMetafields(
        collectionId,
        collectionType,
      );

      return {
        ...collection,
        id: String(collection.id),
        collection_type: collectionType,
        metafields,
        bannerImage: this.getMetafieldValue(metafields, 'bannerimage'),
        footerBrand: this.getMetafieldValue(metafields, 'footerbrand'),
        overviewCollection: this.getMetafieldValue(
          metafields,
          'overviewcollection',
        ),
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Failed to fetch collection:', error.message);
      throw new InternalServerErrorException(
        'Failed to fetch collection details',
      );
    }
  }

  async getCollectionProducts(collectionId: string, limit: number = 50) {
    const cacheKey = `products:col:${collectionId}:${limit}`;
    const cached = this.cache.get<any>(cacheKey);
    if (cached) return cached;

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
      const result = { products, count: products.length };
      this.cache.set(cacheKey, result, this.CACHE_TTL.products);
      return result;
    } catch (error) {
      this.logger.error('Failed to fetch collection products:', error.message);
      throw new InternalServerErrorException(
        'Failed to fetch collection products',
      );
    }
  }

  // async getCollectionByHandle(handle: string) {
  //   try {
  //     const client = new this.shopify.clients.Rest({ session: this.session });

  //     this.logger.log(`Fetching collection with handle: ${handle}`);

  //     let collectionType: 'custom' | 'smart' = 'custom';

  //     let response = await this.enqueueShopifyRequest(() =>
  //       client.get({
  //         path: 'custom_collections',
  //         query: { handle },
  //       }),
  //     );

  //     let collections = (response as any).body['custom_collections'] || [];

  //     if (collections.length === 0) {
  //       response = await this.enqueueShopifyRequest(() =>
  //         client.get({
  //           path: 'smart_collections',
  //           query: { handle },
  //         }),
  //       );

  //       collections = (response as any).body['smart_collections'] || [];
  //       collectionType = 'smart';
  //     }

  //     if (collections.length === 0) {
  //       throw new NotFoundException(
  //         `Collection with handle '${handle}' not found`,
  //       );
  //     }

  //     const collection = collections[0];

  //     const metafields = await this.getCollectionImageMetafields(
  //       String(collection.id),
  //       collectionType,
  //     );

  //     return {
  //       ...collection,
  //       id: String(collection.id),
  //       collection_type: collectionType,
  //       metafields,
  //       bannerImage: this.getMetafieldValue(metafields, 'bannerimage'),
  //       footerBrand: this.getMetafieldValue(metafields, 'footerbrand'),
  //       overviewCollection: this.getMetafieldValue(
  //         metafields,
  //         'overviewcollection',
  //       ),
  //     };
  //   } catch (error) {
  //     if (error instanceof NotFoundException) throw error;
  //     this.logger.error('Failed to fetch collection by handle:', error.message);
  //     throw new InternalServerErrorException('Failed to fetch collection');
  //   }
  // }

  // ==================== CUSTOMERS ====================

  async getCollectionByHandle(handle: string) {
    const cacheKey = `collection:handle:${handle}`;
    const cached = this.cache.get<any>(cacheKey);
    if (cached) return cached;

    try {
      const shopDomain = this.configService.get<string>('SHOPIFY_STORE_DOMAIN');
      const accessToken = this.configService.get<string>(
        'SHOPIFY_ACCESS_TOKEN',
      );

      const normalizedDomain = shopDomain!
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
      const endpoint = `https://${normalizedDomain}/admin/api/2024-10/graphql.json`;

      const graphqlQuery = `
      query getCollectionByHandle($handle: String!) {
        collectionByHandle(handle: $handle) {
          id
          legacyResourceId
          title
          handle
          descriptionHtml
          image { url altText width height }
          ruleSet { rules { column relation condition } }
          metafields(first: 20, namespace: "custom") {
            edges {
              node {
                key
                value
                type
              }
            }
          }
        }
      }
    `;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken!,
        },
        body: JSON.stringify({ query: graphqlQuery, variables: { handle } }),
      });

      const json = await response.json();

      console.log(
        `GraphQL response for collectionByHandle(${handle}): ${JSON.stringify(json)}`,
      );
      if (json.errors?.length) {
        this.logger.error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
        throw new Error('Shopify GraphQL returned errors');
      }

      const node = json?.data?.collectionByHandle;
      if (!node) {
        throw new NotFoundException(
          `Collection with handle '${handle}' not found`,
        );
      }

      const metafieldEdges = node.metafields?.edges ?? [];
      const metafields = metafieldEdges.map((e: any) => e.node);

      // Single line text (List) stores a JSON array of numeric ID strings
      const subCollectionsNode = metafields.find(
        (m: any) => m.key?.toLowerCase() === 'subcollections',
      );
      let subCollections: { id: string }[] = [];
      if (subCollectionsNode?.value) {
        try {
          const parsed = JSON.parse(subCollectionsNode.value);
          if (Array.isArray(parsed)) {
            subCollections = parsed.map((id: any) => ({
              id: String(id).replace(/\D/g, ''),
            }));
          }
        } catch {
          this.logger.warn(
            `Failed to parse subCollections value: ${subCollectionsNode.value}`,
          );
        }
      }

      const hasRuleSet = node.ruleSet?.rules?.length > 0;

      const result = {
        id: String(node.legacyResourceId),
        gid: node.id,
        title: node.title,
        handle: node.handle,
        body_html: node.descriptionHtml,
        description: node.descriptionHtml,
        image: node.image
          ? {
              src: node.image.url,
              alt: node.image.altText,
              width: node.image.width,
              height: node.image.height,
            }
          : null,
        collection_type: hasRuleSet ? 'smart' : 'custom',
        metafields,
        bannerImage: this.getMetafieldValueInsensitive(
          metafields,
          'bannerImage',
        ),
        footerBrand: this.getMetafieldValueInsensitive(
          metafields,
          'footerBrand',
        ),
        overviewCollection: this.getMetafieldValueInsensitive(
          metafields,
          'overviewCollection',
        ),
        subCollections,
      };

      this.cache.set(cacheKey, result, this.CACHE_TTL.collections);
      return result;
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        'Failed to fetch collection by handle:',
        error?.message ?? error,
      );
      throw new InternalServerErrorException('Failed to fetch collection');
    }
  }

  // Case-insensitive helper (GraphQL preserves camelCase but be safe)
  private getMetafieldValueInsensitive(metafields: any[], key: string): string {
    const lower = key.toLowerCase();
    const found = metafields.find((m: any) => m?.key?.toLowerCase() === lower);
    return found?.value ?? '';
  }

  async getSubCollectionsSummary(ids: string[]) {
    if (!ids?.length) return { subCollections: [] };

    const cacheKey = `subcollections:${[...ids].sort().join(',')}`;
    const cached = this.cache.get<any>(cacheKey);
    if (cached) return cached;

    try {
      const shopDomain = this.configService.get<string>('SHOPIFY_STORE_DOMAIN');
      const accessToken = this.configService.get<string>(
        'SHOPIFY_ACCESS_TOKEN',
      );

      const normalizedDomain = shopDomain!
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
      const endpoint = `https://${normalizedDomain}/admin/api/2024-10/graphql.json`;

      const gids = ids.map((id) => `gid://shopify/Collection/${id}`);
      this.logger.log(`GIDs being sent: ${JSON.stringify(gids)}`);

      const graphqlQuery = `
      query getSubCollections($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Collection {
            id
            legacyResourceId
            title
            handle
            descriptionHtml
            image { url altText }
            metafields(first: 10, namespace: "custom") {
              edges { node { key value type } }
            }
          }
        }
      }
    `;

      this.logger.log(`Fetching sub-collections for ${gids.length} GIDs`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken!,
        },
        body: JSON.stringify({ query: graphqlQuery, variables: { ids: gids } }),
      });

      const json = await response.json();
      if (json.errors?.length) {
        this.logger.error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
        throw new Error('Shopify GraphQL returned errors');
      }

      const nodes = (json?.data?.nodes ?? []).filter(Boolean);
      this.logger.log(`Resolved ${nodes.length} sub-collection nodes`);

      const subCollections = nodes.map((n: any) => {
        const metafields = (n.metafields?.edges ?? []).map((e: any) => e.node);

        // Case-insensitive lookup — Shopify lowercases keys in REST, GraphQL varies
        const getVal = (key: string) => {
          const lower = key.toLowerCase();
          return (
            metafields.find((m: any) => m?.key?.toLowerCase() === lower)
              ?.value ?? ''
          );
        };

        const overviewUrl =
          getVal('overviewCollection') || getVal('overviewcollection');
        const imageUrl = overviewUrl || n.image?.url || '';

        return {
          id: String(n.legacyResourceId),
          handle: n.handle,
          title: n.title,
          description: n.descriptionHtml ?? '',
          imageUrl,
        };
      });

      const result = { subCollections };
      this.cache.set(cacheKey, result, this.CACHE_TTL.collections);
      return result;
    } catch (error: any) {
      this.logger.error(
        'Failed to fetch sub-collections:',
        error?.message ?? error,
      );
      throw new InternalServerErrorException('Failed to fetch sub-collections');
    }
  }

  // async getSubCollectionsSummary(ids: string[]) {
  //   if (!ids?.length) return { subCollections: [] };

  //   const cacheKey = `subcollections:${ids.sort().join(',')}`;
  //   const cached = this.cache.get<any>(cacheKey);
  //   if (cached) return cached;

  //   try {
  //     const shopDomain = this.configService.get<string>('SHOPIFY_STORE_DOMAIN');
  //     const accessToken = this.configService.get<string>(
  //       'SHOPIFY_ACCESS_TOKEN',
  //     );

  //     const normalizedDomain = shopDomain!
  //       .replace(/^https?:\/\//, '')
  //       .replace(/\/$/, '');
  //     const endpoint = `https://${normalizedDomain}/admin/api/2024-10/graphql.json`;

  //     const gids = ids.map((id) => `gid://shopify/Collection/${id}`);

  //     const graphqlQuery = `
  //     query getSubCollections($ids: [ID!]!) {
  //       nodes(ids: $ids) {
  //         ... on Collection {
  //           id
  //           legacyResourceId
  //           title
  //           handle
  //           descriptionHtml
  //           image { url altText }
  //           metafields(first: 10, namespace: "custom") {
  //             edges { node { key value type } }
  //           }
  //         }
  //       }
  //     }
  //   `;

  //     const response = await fetch(endpoint, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'X-Shopify-Access-Token': accessToken!,
  //       },
  //       body: JSON.stringify({ query: graphqlQuery, variables: { ids: gids } }),
  //     });

  //     const json = await response.json();
  //     if (json.errors?.length) {
  //       this.logger.error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  //       throw new Error('Shopify GraphQL returned errors');
  //     }

  //     const nodes = (json?.data?.nodes ?? []).filter(Boolean);

  //     const subCollections = nodes.map((n: any) => {
  //       const metafields = (n.metafields?.edges ?? []).map((e: any) => e.node);
  //       const overview = this.getMetafieldValueInsensitive(
  //         metafields,
  //         'overviewCollection',
  //       );
  //       return {
  //         id: String(n.legacyResourceId),
  //         handle: n.handle,
  //         title: n.title,
  //         description: n.descriptionHtml ?? '',
  //         imageUrl: overview || n.image?.url || '',
  //       };
  //     });

  //     const result = { subCollections };
  //     this.cache.set(cacheKey, result, this.CACHE_TTL.collections);
  //     return result;
  //   } catch (error: any) {
  //     this.logger.error(
  //       'Failed to fetch sub-collections:',
  //       error?.message ?? error,
  //     );
  //     throw new InternalServerErrorException('Failed to fetch sub-collections');
  //   }
  // }

  //CUSTOMERS//
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
    const cacheKey = `bestsellers:${limit}:${days}`;
    const cached = this.cache.get<any>(cacheKey);
    if (cached) return cached;

    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      this.logger.log(`Calculating bestsellers for last ${days} days`);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const ordersResponse = await this.enqueueShopifyRequest(() =>
        client.get({
          path: 'orders',
          query: {
            status: 'any',
            limit: 250,
            created_at_min: startDate.toISOString(),
          },
        }),
      );

      const orders = (ordersResponse as any).body['orders'] || [];

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

      // Fetch full product details sequentially to avoid rate limits
      const bestsellers: any[] = [];
      for (const item of sortedProducts as any[]) {
        try {
          const product = await this.getProductById(item.product_id);
          bestsellers.push({
            ...product,
            sales_data: {
              quantity_sold: item.quantity_sold,
              revenue: item.revenue,
            },
          });
        } catch (error) {
          this.logger.warn(
            `Failed to fetch product ${item.product_id}:`,
            error.message,
          );
        }
      }

      const result = {
        bestsellers,
        count: bestsellers.length,
        period: `${days} days`,
      };
      this.cache.set(cacheKey, result, this.CACHE_TTL.bestsellers);
      return result;
    } catch (error) {
      this.logger.error('Failed to calculate bestsellers:', error.message);
      throw new InternalServerErrorException('Failed to calculate bestsellers');
    }
  }

  // ==================== SALE ====================

  // /**
  //  * Get sale products (variant.compare_at_price > variant.price)
  //  */
  // async getSaleProducts(limit = 40, minDiscount = 0, brand?: string) {
  //   const normalizedBrand = String(brand ?? '')
  //     .trim()
  //     .toLowerCase();
  //   const cacheKey = `sale:${limit}:${minDiscount}:${normalizedBrand}`;
  //   const cached = this.cache.get<any>(cacheKey);
  //   if (cached) return cached;

  //   try {
  //     const client = new this.shopify.clients.Rest({ session: this.session });

  //     const res = await this.enqueueShopifyRequest(() =>
  //       client.get({
  //         path: 'products',
  //         query: { limit: 250, status: 'active' },
  //       }),
  //     );

  //     const products = (res as any).body['products'] ?? [];

  //     const sale = products
  //       .filter((p: any) => {
  //         if (!normalizedBrand) return true;

  //         const handle = String(p?.handle ?? '')
  //           .trim()
  //           .toLowerCase();

  //         const firstPart = handle.split('-')[0];
  //         return firstPart === normalizedBrand;
  //       })
  //       .map((p: any) => {
  //         const variants = Array.isArray(p?.variants) ? p.variants : [];

  //         let bestDiscountPct = -1;
  //         let bestPrice: number | null = null;
  //         let bestCompareAt: number | null = null;

  //         for (const v of variants) {
  //           const price = Number(v?.price);
  //           const compareAt = Number(v?.compare_at_price);

  //           if (!Number.isFinite(price) || !Number.isFinite(compareAt))
  //             continue;
  //           if (compareAt <= price) continue;

  //           const pct = ((compareAt - price) / compareAt) * 100;

  //           if (pct > bestDiscountPct) {
  //             bestDiscountPct = pct;
  //             bestPrice = price;
  //             bestCompareAt = compareAt;
  //           }
  //         }

  //         if (bestDiscountPct < 0) return null;
  //         if (bestDiscountPct < minDiscount) return null;

  //         return {
  //           ...p,
  //           sale_data: {
  //             best_price: bestPrice,
  //             best_compare_at_price: bestCompareAt,
  //             discount_percent: Number(bestDiscountPct.toFixed(2)),
  //           },
  //         };
  //       })
  //       .filter(Boolean)
  //       .sort(
  //         (a: any, b: any) =>
  //           (b.sale_data?.discount_percent ?? 0) -
  //           (a.sale_data?.discount_percent ?? 0),
  //       )
  //       .slice(0, limit);

  //     const result = {
  //       sale,
  //       count: sale.length,
  //       minDiscount,
  //       brand: normalizedBrand || null,
  //       source: 'compare_at_price',
  //     };
  //     this.cache.set(cacheKey, result, this.CACHE_TTL.sale);
  //     return result;
  //   } catch (error) {
  //     this.logger.error('Failed to fetch sale products:', error.message);
  //     throw new InternalServerErrorException('Failed to fetch sale products');
  //   }
  // }

  /**
   * Get sale products (variant.compare_at_price > variant.price)
   * Paginates through the entire active catalog so no sale items are missed.
   */
  async getSaleProducts(limit = 40, minDiscount = 0, brand?: string) {
    const normalizedBrand = String(brand ?? '')
      .trim()
      .toLowerCase();
    const cacheKey = `sale:${limit}:${minDiscount}:${normalizedBrand}`;
    const cached = this.cache.get<any>(cacheKey);
    if (cached) return cached;

    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      // --- Paginate through ALL active products ---
      const allProducts: any[] = [];
      let pageInfo: string | undefined = undefined;
      const MAX_PAGES = 20; // safety cap: 20 * 250 = 5,000 products

      for (let page = 0; page < MAX_PAGES; page++) {
        const query: Record<string, any> = { limit: 250 };

        // On the first request, filter by status. On subsequent requests,
        // Shopify REQUIRES that only `page_info` and `limit` be sent.
        if (pageInfo) {
          query.page_info = pageInfo;
        } else {
          query.status = 'active';
        }

        const res: any = await this.enqueueShopifyRequest(() =>
          client.get({ path: 'products', query }),
        );

        const pageProducts = res.body?.products ?? [];
        allProducts.push(...pageProducts);

        // Shopify returns pagination info in the Link header.
        // The shopify-api-node client exposes it as res.pageInfo.nextPage.query.page_info
        const nextPageInfo =
          res?.pageInfo?.nextPage?.query?.page_info ??
          res?.pageInfo?.nextPageUrl ??
          null;

        if (!nextPageInfo || pageProducts.length < 250) break;
        pageInfo = nextPageInfo;
      }

      this.logger.log(
        `Fetched ${allProducts.length} active products for sale scan`,
      );

      // --- Filter + compute best discount (unchanged logic) ---
      const sale = allProducts
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

      const result = {
        sale,
        count: sale.length,
        minDiscount,
        brand: normalizedBrand || null,
        source: 'compare_at_price',
      };
      this.cache.set(cacheKey, result, this.CACHE_TTL.sale);
      return result;
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

  /**
   * Runs an async operation over an array in parallel chunks of `concurrency`.
   * Safer than Promise.all (no burst) while faster than fully sequential.
   */
  private async chunkMap<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += concurrency) {
      const chunk = items.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map((item, j) => fn(item, i + j)),
      );
      results.push(...chunkResults);
    }
    return results;
  }

  /**
   * Invalidate cached data manually (e.g. after a webhook or admin update).
   * Call this from a dedicated POST /shopify/cache/invalidate endpoint if needed.
   */
  invalidateCache(key?: 'collections' | 'sale' | 'bestsellers' | 'all'): void {
    if (!key || key === 'all') {
      this.cache.delete('collections:all');
      this.logger.log('Cache invalidated: all');
    } else if (key === 'collections') {
      this.cache.delete('collections:all');
      this.logger.log('Cache invalidated: collections');
    } else {
      this.logger.log(
        `Cache invalidate hint received for: ${key} (TTL-based, will expire naturally)`,
      );
    }
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
