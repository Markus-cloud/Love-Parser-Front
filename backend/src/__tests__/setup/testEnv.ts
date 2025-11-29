const ensureEnv = (key: string, fallback: string) => {
  if (!process.env[key] || process.env[key]?.length === 0) {
    process.env[key] = fallback;
  }
};

process.env.NODE_ENV = "test";
ensureEnv("HOST", "0.0.0.0");
ensureEnv("PORT", "3000");
ensureEnv("FRONTEND_URL", "http://localhost:5173");
ensureEnv("CORS_ORIGIN", "http://localhost:5173");
ensureEnv("JWT_SECRET", "test-suite-jwt-secret-change-me");
ensureEnv("SESSION_ENCRYPTION_KEY", "test-suite-session-encryption-key-32chars");
ensureEnv("REQUEST_BODY_LIMIT", "1048576");
ensureEnv("RATE_LIMIT_WINDOW_MS", "60000");
ensureEnv("RATE_LIMIT_MAX", "100");

const fallbackDbUrl =
  process.env.CI === "true"
    ? "postgresql://love_parser:love_parser@127.0.0.1:5432/test-loveparser"
    : "postgresql://love_parser:love_parser@127.0.0.1:5432/love_parser_test";
ensureEnv("DATABASE_URL", fallbackDbUrl);
ensureEnv("POSTGRES_URL", process.env.DATABASE_URL as string);
ensureEnv("REDIS_URL", "redis://127.0.0.1:6379/1");

ensureEnv("TELEGRAM_API_ID", "0");
ensureEnv("TELEGRAM_API_HASH", "test-telegram-hash");
ensureEnv("TELEGRAM_SESSION", "");
ensureEnv("ROBOKASSA_MERCHANT_LOGIN", "demoMerchant");
ensureEnv("ROBOKASSA_PASSWORD1", "demoPassword1");
ensureEnv("ROBOKASSA_PASSWORD2", "demoPassword2");
ensureEnv("ROBOKASSA_IS_TEST", "true");
ensureEnv("ROBOKASSA_PAYMENT_URL", "https://auth.robokassa.ru/Merchant/Index.aspx");
