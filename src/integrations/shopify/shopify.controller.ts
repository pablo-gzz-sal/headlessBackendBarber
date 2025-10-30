import { Controller, Get, Post, Put, Param, Query, Body, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ShopifyService } from './shopify.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateGiftCardDto } from './dto/gift-card.dto';

@ApiTags('Shopify')
@Controller('shopify')
export class ShopifyController {
  constructor(private readonly shopifyService: ShopifyService) {}

  // ==================== HEALTH ====================

  @Get('health')
  @ApiOperation({ summary: 'Health check', description: 'Check if Shopify connection is working' })
  @ApiResponse({ status: 200, description: 'Connection status retrieved' })
  async healthCheck() {
    return this.shopifyService.healthCheck();
  }

  // ==================== PRODUCTS ====================

  @Get('products')
  @ApiOperation({ summary: 'Get all products', description: 'Fetch products from Shopify with optional filters' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getProducts(@Query() query: ProductQueryDto) {
    return this.shopifyService.getProducts(query);
  }

  @Get('products/search')
  @ApiOperation({ summary: 'Search products', description: 'Search products by title' })
  @ApiQuery({ name: 'query', description: 'Search query', required: true })
  @ApiQuery({ name: 'limit', description: 'Number of results', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Products found successfully' })
  async searchProducts(
    @Query('query') query: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.shopifyService.searchProducts(query, limit);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get product by ID', description: 'Fetch a single product by its ID' })
  @ApiParam({ name: 'id', description: 'Product ID', type: String })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProductById(@Param('id') id: string) {
    return this.shopifyService.getProductById(id);
  }

  // ==================== COLLECTIONS ====================

  @Get('collections')
  @ApiOperation({ summary: 'Get all collections', description: 'Fetch all product collections' })
  @ApiResponse({ status: 200, description: 'Collections retrieved successfully' })
  async getCollections(@Query() query: CollectionQueryDto) {
    return this.shopifyService.getCollections(query);
  }

  @Get('collections/:id')
  @ApiOperation({ summary: 'Get collection by ID', description: 'Fetch a single collection by its ID' })
  @ApiParam({ name: 'id', description: 'Collection ID', type: String })
  @ApiResponse({ status: 200, description: 'Collection retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  async getCollectionById(@Param('id') id: string) {
    return this.shopifyService.getCollectionById(id);
  }

  @Get('collections/:id/products')
  @ApiOperation({ summary: 'Get collection products', description: 'Fetch all products in a collection' })
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
  @ApiOperation({ summary: 'Get all customers', description: 'Fetch customers with optional filters' })
  @ApiResponse({ status: 200, description: 'Customers retrieved successfully' })
  async getCustomers(@Query() query: CustomerQueryDto) {
    return this.shopifyService.getCustomers(query);
  }

  @Get('customers/segments')
  @ApiOperation({ summary: 'Get customer segments', description: 'Fetch all customer segments/saved searches' })
  @ApiResponse({ status: 200, description: 'Customer segments retrieved successfully' })
  async getCustomerSegments() {
    return this.shopifyService.getCustomerSegments();
  }

  @Get('customers/:id')
  @ApiOperation({ summary: 'Get customer by ID', description: 'Fetch a single customer by their ID' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: String })
  @ApiResponse({ status: 200, description: 'Customer retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerById(@Param('id') id: string) {
    return this.shopifyService.getCustomerById(id);
  }

  @Post('customers')
  @ApiOperation({ summary: 'Create a new customer', description: 'Create a new customer in Shopify' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createCustomer(@Body() customerData: CreateCustomerDto) {
    return this.shopifyService.createCustomer(customerData);
  }

  @Put('customers/:id')
  @ApiOperation({ summary: 'Update customer', description: 'Update an existing customer' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: String })
  @ApiResponse({ status: 200, description: 'Customer updated successfully' })
  async updateCustomer(
    @Param('id') id: string,
    @Body() customerData: Partial<CreateCustomerDto>,
  ) {
    return this.shopifyService.updateCustomer(id, customerData);
  }

  @Get('customers/:id/orders')
  @ApiOperation({ summary: 'Get customer orders', description: 'Fetch all orders for a specific customer' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: String })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  async getCustomerOrders(@Param('id') id: string) {
    return this.shopifyService.getCustomerOrders(id);
  }

  // ==================== GIFT CARDS ====================

  @Get('gift-cards')
  @ApiOperation({ summary: 'Get all gift cards', description: 'Fetch all gift cards' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Gift cards retrieved successfully' })
  async getGiftCards(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.shopifyService.getGiftCards(limit);
  }

  @Get('gift-cards/:id')
  @ApiOperation({ summary: 'Get gift card by ID', description: 'Fetch a single gift card by its ID' })
  @ApiParam({ name: 'id', description: 'Gift Card ID', type: String })
  @ApiResponse({ status: 200, description: 'Gift card retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Gift card not found' })
  async getGiftCardById(@Param('id') id: string) {
    return this.shopifyService.getGiftCardById(id);
  }

  @Post('gift-cards')
  @ApiOperation({ summary: 'Create a gift card', description: 'Create a new gift card' })
  @ApiResponse({ status: 201, description: 'Gift card created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createGiftCard(@Body() giftCardData: CreateGiftCardDto) {
    return this.shopifyService.createGiftCard(giftCardData);
  }

  @Post('gift-cards/:id/disable')
  @ApiOperation({ summary: 'Disable gift card', description: 'Disable an existing gift card' })
  @ApiParam({ name: 'id', description: 'Gift Card ID', type: String })
  @ApiResponse({ status: 200, description: 'Gift card disabled successfully' })
  async disableGiftCard(@Param('id') id: string) {
    return this.shopifyService.disableGiftCard(id);
  }

  // ==================== ORDERS ====================

  @Post('orders')
  @ApiOperation({ summary: 'Create a new order', description: 'Create a new order in Shopify' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createOrder(@Body() orderData: CreateOrderDto) {
    return this.shopifyService.createOrder(orderData);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Get all orders', description: 'Fetch orders from Shopify' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String, enum: ['open', 'closed', 'cancelled', 'any'] })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  async getOrders(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.shopifyService.getOrders(limit, status);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get order by ID', description: 'Fetch a single order by its ID' })
  @ApiParam({ name: 'id', description: 'Order ID', type: String })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderById(@Param('id') id: string) {
    return this.shopifyService.getOrderById(id);
  }
}