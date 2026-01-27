import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  ParseIntPipe,
  DefaultValuePipe,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { ShopifyService } from './shopify.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateGiftCardDto } from './dto/gift-card.dto';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { CreateSmartCollectionDto } from './dto/smart-collection.dto';
import { CreateMetafieldDto } from './dto/metafield.dto';
import { FeaturedProductsDto } from './dto/featured-products.dto';

@ApiTags('Shopify')
@Controller('shopify')
export class ShopifyController {
  constructor(private readonly shopifyService: ShopifyService) {}

  // ==================== HEALTH ====================

  @Get('health')
  @ApiOperation({
    summary: 'Health check',
    description: 'Check if Shopify connection is working',
  })
  @ApiResponse({ status: 200, description: 'Connection status retrieved' })
  async healthCheck() {
    return this.shopifyService.healthCheck();
  }

  // ==================== PRODUCTS ====================

  @Get('products')
  @ApiOperation({
    summary: 'Get all products',
    description: 'Fetch products from Shopify with optional filters',
  })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getProducts(@Query() query: ProductQueryDto) {
    return this.shopifyService.getProducts(query);
  }

  @Get('products/search')
  @ApiOperation({
    summary: 'Search products',
    description: 'Search products by title',
  })
  @ApiQuery({ name: 'query', description: 'Search query', required: true })
  @ApiQuery({
    name: 'limit',
    description: 'Number of results',
    required: false,
    type: Number,
  })
  @ApiResponse({ status: 200, description: 'Products found successfully' })
  async searchProducts(
    @Query('query') query: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.shopifyService.searchProducts(query, limit);
  }

  @Get('products/:id')
  @ApiOperation({
    summary: 'Get product by ID',
    description: 'Fetch a single product by its ID',
  })
  @ApiParam({ name: 'id', description: 'Product ID', type: String })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProductById(@Param('id') id: string) {
    return this.shopifyService.getProductById(id);
  }

  // ==================== COLLECTIONS ====================

  @Get('collections')
  @ApiOperation({
    summary: 'Get all collections',
    description: 'Fetch all product collections',
  })
  @ApiResponse({
    status: 200,
    description: 'Collections retrieved successfully',
  })
  async getCollections(@Query() query: CollectionQueryDto) {
    return this.shopifyService.getCollections(query);
  }

  @Get('collections/:id')
  @ApiOperation({
    summary: 'Get collection by ID',
    description: 'Fetch a single collection by its ID',
  })
  @ApiParam({ name: 'id', description: 'Collection ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Collection retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  async getCollectionById(@Param('id') id: string) {
    return this.shopifyService.getCollectionById(id);
  }

  @Get('collections/:id/products')
  @ApiOperation({
    summary: 'Get collection products',
    description: 'Fetch all products in a collection',
  })
  @ApiParam({ name: 'id', description: 'Collection ID', type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  async getCollectionProducts(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.shopifyService.getCollectionProducts(id, limit);
  }

  // ==================== CUSTOMERS ====================

  @Get('customers')
  @ApiOperation({
    summary: 'Get all customers',
    description: 'Fetch customers with optional filters',
  })
  @ApiResponse({ status: 200, description: 'Customers retrieved successfully' })
  async getCustomers(@Query() query: CustomerQueryDto) {
    return this.shopifyService.getCustomers(query);
  }

  @Get('customers/segments')
  @ApiOperation({
    summary: 'Get customer segments',
    description: 'Fetch all customer segments/saved searches',
  })
  @ApiResponse({
    status: 200,
    description: 'Customer segments retrieved successfully',
  })
  async getCustomerSegments() {
    return this.shopifyService.getCustomerSegments();
  }

  @Get('customers/:id')
  @ApiOperation({
    summary: 'Get customer by ID',
    description: 'Fetch a single customer by their ID',
  })
  @ApiParam({ name: 'id', description: 'Customer ID', type: String })
  @ApiResponse({ status: 200, description: 'Customer retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerById(@Param('id') id: string) {
    return this.shopifyService.getCustomerById(id);
  }

  @Post('customers')
  @ApiOperation({
    summary: 'Create a new customer',
    description: 'Create a new customer in Shopify',
  })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createCustomer(@Body() customerData: CreateCustomerDto) {
    return this.shopifyService.createCustomer(customerData);
  }

  @Put('customers/:id')
  @ApiOperation({
    summary: 'Update customer',
    description: 'Update an existing customer',
  })
  @ApiParam({ name: 'id', description: 'Customer ID', type: String })
  @ApiResponse({ status: 200, description: 'Customer updated successfully' })
  async updateCustomer(
    @Param('id') id: string,
    @Body() customerData: Partial<CreateCustomerDto>,
  ) {
    return this.shopifyService.updateCustomer(id, customerData);
  }

  @Get('customers/:id/orders')
  @ApiOperation({
    summary: 'Get customer orders',
    description: 'Fetch all orders for a specific customer',
  })
  @ApiParam({ name: 'id', description: 'Customer ID', type: String })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  async getCustomerOrders(@Param('id') id: string) {
    return this.shopifyService.getCustomerOrders(id);
  }

  // ==================== GIFT CARDS ====================

  @Get('gift-cards')
  @ApiOperation({
    summary: 'Get all gift cards',
    description: 'Fetch all gift cards',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Gift cards retrieved successfully',
  })
  async getGiftCards(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.shopifyService.getGiftCards(limit);
  }

  @Get('gift-cards/:id')
  @ApiOperation({
    summary: 'Get gift card by ID',
    description: 'Fetch a single gift card by its ID',
  })
  @ApiParam({ name: 'id', description: 'Gift Card ID', type: String })
  @ApiResponse({ status: 200, description: 'Gift card retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Gift card not found' })
  async getGiftCardById(@Param('id') id: string) {
    return this.shopifyService.getGiftCardById(id);
  }

  @Post('gift-cards')
  @ApiOperation({
    summary: 'Create a gift card',
    description: 'Create a new gift card',
  })
  @ApiResponse({ status: 201, description: 'Gift card created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createGiftCard(@Body() giftCardData: CreateGiftCardDto) {
    return this.shopifyService.createGiftCard(giftCardData);
  }

  @Post('gift-cards/:id/disable')
  @ApiOperation({
    summary: 'Disable gift card',
    description: 'Disable an existing gift card',
  })
  @ApiParam({ name: 'id', description: 'Gift Card ID', type: String })
  @ApiResponse({ status: 200, description: 'Gift card disabled successfully' })
  async disableGiftCard(@Param('id') id: string) {
    return this.shopifyService.disableGiftCard(id);
  }

  // ==================== ORDERS ====================

  @Post('orders')
  @ApiOperation({
    summary: 'Create a new order',
    description: 'Create a new order in Shopify',
  })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createOrder(@Body() orderData: CreateOrderDto) {
    return this.shopifyService.createOrder(orderData);
  }

  @Get('orders')
  @ApiOperation({
    summary: 'Get all orders',
    description: 'Fetch orders from Shopify',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    enum: ['open', 'closed', 'cancelled', 'any'],
  })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  async getOrders(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.shopifyService.getOrders(limit, status);
  }

  @Get('orders/:id')
  @ApiOperation({
    summary: 'Get order by ID',
    description: 'Fetch a single order by its ID',
  })
  @ApiParam({ name: 'id', description: 'Order ID', type: String })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderById(@Param('id') id: string) {
    return this.shopifyService.getOrderById(id);
  }

  // ==================== PRODUCT RECOMMENDATIONS ====================

  @Get('products/:id/recommendations')
  @ApiOperation({
    summary: 'Get product recommendations',
    description:
      'Get "You might also like" product recommendations using Shopify\'s recommendation engine',
  })
  @ApiParam({ name: 'id', description: 'Product ID', type: String })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of recommendations (1-10)',
  })
  @ApiResponse({
    status: 200,
    description: 'Recommendations retrieved successfully',
  })
  async getProductRecommendations(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(4), ParseIntPipe) limit: number,
  ) {
    return this.shopifyService.getProductRecommendations({
      productId: id,
      limit,
    });
  }

  @Get('products/:id/related')
  @ApiOperation({
    summary: 'Get related products',
    description:
      'Get related products based on collection and tags (fallback for recommendations)',
  })
  @ApiParam({ name: 'id', description: 'Product ID', type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Related products retrieved successfully',
  })
  async getRelatedProducts(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(4), ParseIntPipe) limit: number,
  ) {
    return this.shopifyService.getRelatedProducts(id, limit);
  }

  // ==================== SMART COLLECTIONS ====================

  @Get('smart-collections')
  @ApiOperation({
    summary: 'Get smart collections',
    description:
      'Get all smart collections (auto-updating collections based on rules)',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Smart collections retrieved successfully',
  })
  async getSmartCollections(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.shopifyService.getSmartCollections(limit);
  }

  @Get('smart-collections/:id')
  @ApiOperation({ summary: 'Get smart collection by ID' })
  @ApiParam({ name: 'id', description: 'Smart Collection ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Smart collection retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Smart collection not found' })
  async getSmartCollectionById(@Param('id') id: string) {
    return this.shopifyService.getSmartCollectionById(id);
  }

  @Post('smart-collections')
  @ApiOperation({
    summary: 'Create smart collection',
    description:
      "Create a new smart collection with automated rules (e.g., for Sale, Joey's Faves)",
  })
  @ApiResponse({
    status: 201,
    description: 'Smart collection created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createSmartCollection(
    @Body() collectionData: CreateSmartCollectionDto,
  ) {
    return this.shopifyService.createSmartCollection(collectionData);
  }

  @Put('smart-collections/:id')
  @ApiOperation({ summary: 'Update smart collection' })
  @ApiParam({ name: 'id', description: 'Smart Collection ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Smart collection updated successfully',
  })
  async updateSmartCollection(
    @Param('id') id: string,
    @Body() collectionData: Partial<CreateSmartCollectionDto>,
  ) {
    return this.shopifyService.updateSmartCollection(id, collectionData);
  }

  @Delete('smart-collections/:id')
  @ApiOperation({ summary: 'Delete smart collection' })
  @ApiParam({ name: 'id', description: 'Smart Collection ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Smart collection deleted successfully',
  })
  async deleteSmartCollection(@Param('id') id: string) {
    return this.shopifyService.deleteSmartCollection(id);
  }

  // ==================== FEATURED SECTIONS ====================

  @Get('collections/by-handle/:handle')
  @ApiOperation({
    summary: 'Get collection by handle',
    description:
      'Get collection using URL-friendly handle (e.g., "joeys-faves", "sale", "bestsellers")',
  })
  @ApiParam({
    name: 'handle',
    description: 'Collection handle',
    type: String,
    example: 'joeys-faves',
  })
  @ApiResponse({
    status: 200,
    description: 'Collection retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  async getCollectionByHandle(@Param('handle') handle: string) {
    return this.shopifyService.getCollectionByHandle(handle);
  }

  @Post('featured-products')
  @ApiOperation({
    summary: 'Get products from multiple collections',
    description:
      'Get products from multiple collections at once (perfect for homepage sections)',
  })
  @ApiBody({ type: FeaturedProductsDto })
  @ApiResponse({
    status: 200,
    description: 'Featured products retrieved successfully',
  })
  async getFeaturedProducts(@Body() dto: FeaturedProductsDto) {
    const limit = dto.limitPerCollection ?? 4;
    return this.shopifyService.getProductsFromMultipleCollections(
      dto.collections,
      limit,
    );
  }

  // ==================== PRODUCT FILTERING ====================

  @Get('products/by-tag/:tag')
  @ApiOperation({
    summary: 'Get products by tag',
    description: 'Filter products by a specific tag',
  })
  @ApiParam({ name: 'tag', description: 'Product tag', type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  async getProductsByTag(
    @Param('tag') tag: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.shopifyService.getProductsByTag(tag, limit);
  }

  // ==================== BESTSELLERS ====================

  @Get('bestsellers')
  @ApiOperation({
    summary: 'Get bestselling products',
    description: 'Get bestselling products based on recent order data',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of bestsellers to return',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to analyze (default 30)',
  })
  @ApiResponse({
    status: 200,
    description: 'Bestsellers retrieved successfully',
  })
  async getBestsellers(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.shopifyService.getBestsellers(limit, days);
  }

  // ==================== METAFIELDS ====================

  @Get('products/:id/metafields')
  @ApiOperation({
    summary: 'Get product metafields',
    description:
      'Get custom metafields for a product (useful for featured product lists)',
  })
  @ApiParam({ name: 'id', description: 'Product ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Metafields retrieved successfully',
  })
  async getProductMetafields(@Param('id') id: string) {
    return this.shopifyService.getProductMetafields(id);
  }

  @Post('products/:id/metafields')
  @ApiOperation({
    summary: 'Create product metafield',
    description: 'Create a custom metafield for a product',
  })
  @ApiParam({ name: 'id', description: 'Product ID', type: String })
  @ApiResponse({ status: 201, description: 'Metafield created successfully' })
  async createProductMetafield(
    @Param('id') id: string,
    @Body() metafieldData: CreateMetafieldDto,
  ) {
    return this.shopifyService.createProductMetafield(id, metafieldData);
  }

  // ==================== SALE ====================

  @Get('sale')
  @ApiOperation({
    summary: 'Get sale products',
    description:
      'Returns products that have at least one variant with compare_at_price > price',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max items (default 20)',
  })
  @ApiQuery({
    name: 'minDiscount',
    required: false,
    type: Number,
    description: 'Minimum discount percent (default 0)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sale products retrieved successfully',
  })
  async getSaleProducts(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('minDiscount', new DefaultValuePipe(0), ParseIntPipe)
    minDiscount: number,
  ) {
    return this.shopifyService.getSaleProducts(limit, minDiscount);
  }
}
