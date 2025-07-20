import { FastifyRequest, FastifyReply } from "fastify";

export interface AuthenticatedRequest extends FastifyRequest {
  token?: string;
}

/**
 * Middleware to validate API tokens
 */
export async function authenticateToken(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    const apiKeyHeader = request.headers["x-api-key"] as string;

    let token: string | undefined;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
    else if (apiKeyHeader) {
      token = apiKeyHeader;
    }

    if (!token) {
      return reply.code(401).send({
        success: false,
        error:
          "Access denied. No token provided. Use Authorization: Bearer <token> or x-api-key header.",
        timestamp: new Date().toISOString(),
      });
    }

    const validTokens = getValidTokens();

    if (!validTokens.includes(token)) {
      return reply.code(403).send({
        success: false,
        error: "Access denied. Invalid token.",
        timestamp: new Date().toISOString(),
      });
    }

    request.token = token;
  } catch (error) {
    console.error("Authentication error:", error);
    return reply.code(500).send({
      success: false,
      error: "Internal authentication error.",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Get valid API tokens from environment variables
 */
function getValidTokens(): string[] {
  const tokens: string[] = [];

  if (process.env.API_TOKEN) {
    tokens.push(process.env.API_TOKEN);
  }

  if (process.env.API_TOKENS) {
    const additionalTokens = process.env.API_TOKENS.split(",").map((token) =>
      token.trim()
    );
    tokens.push(...additionalTokens);
  }

  if (tokens.length === 0 && process.env.NODE_ENV !== "production") {
    console.warn(
      "⚠️  No API tokens configured. Using default token for development."
    );
    tokens.push("dev-token-123");
  }

  if (tokens.length === 0) {
    throw new Error(
      "No API tokens configured. Set API_TOKEN or API_TOKENS environment variable."
    );
  }

  return tokens;
}

/**
 * Generate a secure API token
 */
export function generateAPIToken(length: number = 32): string {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";

  for (let i = 0; i < length; i++) {
    token += charset.charAt(Math.floor(Math.random() * charset.length));
  }

  return token;
}

/**
 * Validate token format (basic validation)
 */
export function isValidTokenFormat(token: string): boolean {
  // Token should be at least 16 characters and contain only alphanumeric characters
  return /^[A-Za-z0-9]{16,}$/.test(token);
}
