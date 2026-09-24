-- PKCE para OAuth de Mercado Pago
ALTER TABLE "OAuthState" ADD COLUMN IF NOT EXISTS "codeVerifier" TEXT;
