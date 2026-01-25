import { Injectable } from '@nestjs/common';

@Injectable()
export class CustomerAccountService {
  private shopId = process.env.SHOPIFY_CUSTOMER_SHOP_ID!;
  // Customer Account API GraphQL endpoint format:
  private endpoint = `https://shopify.com/${this.shopId}/account/customer/api/unstable/graphql`;

  async gql<T>(accessToken: string, query: string, variables?: any): Promise<T> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Customer API request failed');
    if (json.errors?.length) throw new Error(json.errors[0].message);
    return json.data;
  }
}
