import { z } from 'zod';

// Only vars in use are validated. Add WhatsApp/LLM/voice vars in the phase that needs them.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEBHOOK_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars (openssl rand -hex 32)'),
  // Signature verification is always on, even locally: use a test secret in dev.
  WHATSAPP_APP_SECRET: z.string().min(16, 'WHATSAPP_APP_SECRET must be at least 16 chars'),
  WHATSAPP_VERIFY_TOKEN: z.string().min(8, 'WHATSAPP_VERIFY_TOKEN must be at least 8 chars'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Names + reasons only; never echo values, they may be secrets.
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${issues.join('\n')}`);
  }
  return result.data;
}
