import * as oauth from "oauth4webapi";

// Environment variables from Lambda/CDK
const COGNITO_ISSUER = process.env.COGNITO_ISSUER!;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID!;
const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN!;
// AWS_REGION is automatically set in Lambda, extract from issuer URL for local dev
const COGNITO_REGION =
  process.env.AWS_REGION ||
  COGNITO_ISSUER?.match(/\.([^.]+)\.amazonaws\.com/)?.[1] ||
  "us-east-2";

/**
 * Get the application URL from the request
 */
function getAppUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

interface TokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

let authorizationServer: oauth.AuthorizationServer | undefined = undefined;

export async function getAuthorizationServer() {
  if (!authorizationServer) {
    const discoveryResponse = await oauth.discoveryRequest(issuer);
    authorizationServer = await oauth.processDiscoveryResponse(
      issuer,
      discoveryResponse,
    );
  }
  return authorizationServer;
}
const issuer = new URL(COGNITO_ISSUER);
const client = {
  client_id: COGNITO_CLIENT_ID,
} as const;

/**
 * Generate authorization URL for login with PKCE
 */
export async function getLoginUrl(
  request: Request,
  redirectPath: string = "/auth/callback",
) {
  const appUrl = getAppUrl(request);
  const redirectUri = `${appUrl}${redirectPath}`;
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
  const as = await getAuthorizationServer();

  if (!as.authorization_endpoint) {
    throw new Error("Authorization endpoint not found");
  }
  const url = new URL(as.authorization_endpoint);

  url.searchParams.set("client_id", COGNITO_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return {
    url: url.toString(),
    codeVerifier,
  };
}

export async function getPasskeyAddUrl(
  request: Request,
  redirectPath: string = "/auth/callback",
) {
  const appUrl = getAppUrl(request);
  const redirectUri = `${appUrl}${redirectPath}`;
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
  const as = await getAuthorizationServer();

  if (!as.authorization_endpoint) {
    throw new Error("Authorization endpoint not found");
  }

  const url = new URL(as.authorization_endpoint);
  url.pathname = "/passkeys/add";
  url.search = "";

  url.searchParams.set("client_id", COGNITO_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return {
    url: url.toString(),
    codeVerifier,
  };
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const as = await getAuthorizationServer();
  if (!as.token_endpoint) {
    throw new Error("Token endpoint not found");
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: COGNITO_CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(as.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return await response.json();
}

/**
 * Get user info from access token
 */
export async function getUserInfo(
  accessToken: string,
): Promise<Record<string, unknown>> {
  // const userInfoEndpoint = `https://${COGNITO_DOMAIN}.auth.${COGNITO_REGION}.amazoncognito.com/oauth2/userInfo`;

  // // const response = await fetch(userInfoEndpoint, {
  // //   headers: {
  // //     Authorization: `Bearer ${accessToken}`,
  // //   },
  // // });

  const as = await getAuthorizationServer();

  const response = await oauth.userInfoRequest(as, client, accessToken);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`UserInfo request failed: ${error}`);
  }

  return await response.json();
}

/**
 * Generate logout URL
 */
export function getLogoutUrl(request: Request): string {
  const appUrl = getAppUrl(request);
  return `https://${COGNITO_DOMAIN}.auth.${COGNITO_REGION}.amazoncognito.com/logout?client_id=${COGNITO_CLIENT_ID}&logout_uri=${encodeURIComponent(appUrl)}`;
}

/**
 * Get configuration for client-side
 */
export function getAuthConfig() {
  return {
    issuer: COGNITO_ISSUER,
    clientId: COGNITO_CLIENT_ID,
    domain: COGNITO_DOMAIN,
  };
}
