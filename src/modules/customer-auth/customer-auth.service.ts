import crypto from 'crypto';
import { Injectable } from '@nestjs/common';

function base64Url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest();
}

@Injectable()
export class CustomerAuthService {
  private shopId = process.env.SHOPIFY_CUSTOMER_SHOP_ID!;
  private clientId = process.env.SHOPIFY_CUSTOMER_CLIENT_ID!;
  private appUrl = process.env.APP_URL!; // https://YOUR_APP_DOMAIN

  private discoveryUrl = `https://shopify.com/authentication/${this.shopId}/.well-known/openid-configuration`;

  async getOpenIdConfig() {
    const res = await fetch(this.discoveryUrl);
    if (!res.ok) throw new Error(`OpenID discovery failed: ${res.status}`);
    return res.json();
  }

  createPkce() {
    const codeVerifier = base64Url(crypto.randomBytes(32));
    const codeChallenge = base64Url(sha256(codeVerifier));
    return { codeVerifier, codeChallenge };
  }

  createState() {
    return base64Url(crypto.randomBytes(16));
  }

  getRedirectUri() {
    // Shopify redirects the browser back to YOUR APP
    return `${this.appUrl}/account/authorize`;
  }

  buildAuthorizeUrl(openid: any, state: string, codeChallenge: string) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.getRedirectUri(),
      // Shopify Customer Account API scopes commonly include openid/email + customer account api scope
      scope: 'openid email customer-account-api:full',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      locale: 'en',
    });

    return `${openid.authorization_endpoint}?${params.toString()}`;
  }

  async exchangeCodeForToken(openid: any, code: string, codeVerifier: string) {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      code,
      redirect_uri: this.getRedirectUri(),
      code_verifier: codeVerifier,
    });

    const tokenRes = await fetch(openid.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const json = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(json?.error_description || json?.error || 'Token exchange failed');
    }

    return json; // { access_token, refresh_token?, expires_in, id_token?, token_type }
  }
}
