import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ShopifyService } from './shopify.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';

@ApiTags('Shopify')
@Controller('shopify')
export class ShopifyController {
  constructor(private readonly shopifyService: ShopifyService) {}

  @Get('products')
  @ApiOperation({ summary: 'Get all products', description: 'Fetch products from Shopify with optional filters' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getProducts(@Query() query: ProductQueryDto) {
    return this.shopifyService.getProducts(query);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get product by ID', description: 'Fetch a single product by its ID' })
  @ApiParam({ name: 'id', description: 'Product ID', type: String })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getProductById(@Param('id') id: string) {
    return this.shopifyService.getProductById(id);
  }

  @Get('collections')
  @ApiOperation({ summary: 'Get all collections', description: 'Fetch all product collections' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of collections to return' })
  @ApiResponse({ status: 200, description: 'Collections retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getCollections(@Query('limit') limit?: number) {
    return this.shopifyService.getCollections(limit);
  }

  @Post('orders')
  @ApiOperation({ summary: 'Create a new order', description: 'Create a new order in Shopify' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async createOrder(@Body() orderData: CreateOrderDto) {
    return this.shopifyService.createOrder(orderData);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Get all orders', description: 'Fetch orders from Shopify' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String, enum: ['open', 'closed', 'cancelled', 'any'] })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getOrders(
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.shopifyService.getOrders(limit, status);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get order by ID', description: 'Fetch a single order by its ID' })
  @ApiParam({ name: 'id', description: 'Order ID', type: String })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getOrderById(@Param('id') id: string) {
    return this.shopifyService.getOrderById(id);
  }
}