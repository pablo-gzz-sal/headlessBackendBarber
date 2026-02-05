import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CustomerAuthService } from './customer-auth.service';

@Controller('customer-auth')
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService) {}

  isProd = process.env.NODE_ENV === 'production';

  @Get('login')
  async login(@Res() res: Response) {
    const openid = await this.auth.getOpenIdConfig();
    const { codeVerifier, codeChallenge } = this.auth.createPkce();
    const state = this.auth.createState();

    // store verifier + state in httpOnly cookies (10 min)
    res.cookie('shopify_pkce_verifier', codeVerifier, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    });

    res.cookie('shopify_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    });

    const url = this.auth.buildAuthorizeUrl(openid, state, codeChallenge);
    return res.redirect(url);
  }

  /**
   * Your Angular callback route will forward the `code` + `state` here.
   * We exchange it for tokens and set session cookies.
   */
  @Get('callback')
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    const storedState = req.cookies?.shopify_oauth_state;
    const verifier = req.cookies?.shopify_pkce_verifier;

    if (!code || !state || !storedState || storedState !== state || !verifier) {
      return res.status(400).send('Invalid login state. Please try again.');
    }

    const openid = await this.auth.getOpenIdConfig();
    const tokens = await this.auth.exchangeCodeForToken(openid, code, verifier);

    // Store tokens securely (httpOnly cookies)
    res.cookie('shopify_customer_access_token', tokens.access_token, {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000, // 1h (adjust if you want)
    });

    if (tokens.refresh_token) {
      res.cookie('shopify_customer_refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: this.isProd,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
    }

    // cleanup
    res.clearCookie('shopify_pkce_verifier');
    res.clearCookie('shopify_oauth_state');

    // back into your SPA
    return res.redirect(`${process.env.APP_URL}/account`);
  }

  @Get('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    // clear cookies (and optionally redirect to Shopify end-session endpoint if you want full SSO logout)
    res.clearCookie('shopify_customer_access_token');
    res.clearCookie('shopify_customer_refresh_token');
    return res.redirect(`${process.env.APP_URL}`);
  }
  
}
