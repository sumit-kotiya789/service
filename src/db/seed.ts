import { hashPassword } from '../api/auth.js';
import { parseEnv } from '../config/env.js';
import { createPrisma } from './client.js';

// Local/dev data only. Idempotent: safe to re-run.
const SEED_PASSWORD = 'connecthub-dev-password';
const SEED_AGENT_EMAIL = 'agent@connecthub.local';

const env = parseEnv(process.env);
if (env.NODE_ENV === 'production') throw new Error('Refusing to seed production');

const prisma = createPrisma(env.DATABASE_URL);
const passwordHash = await hashPassword(SEED_PASSWORD);

for (const [email, name, role] of [
  ['admin@connecthub.local', 'Admin', 'admin'],
  [SEED_AGENT_EMAIL, 'Agent One', 'agent'],
] as const) {
  await prisma.user.upsert({
    where: { email },
    create: { email, name, role, passwordHash },
    update: {},
  });
}

const contacts = [
  { phone: '919800000001', name: 'Asha Rao', text: 'Hi, is my order shipped?' },
  { phone: '919800000002', name: 'Vikram Singh', text: 'Need help with a refund' },
];
for (const c of contacts) {
  const contact = await prisma.contact.upsert({
    where: { phone: c.phone },
    create: { phone: c.phone, name: c.name },
    update: {},
  });
  const conversation = await prisma.conversation.upsert({
    where: { contactId: contact.id },
    create: { contactId: contact.id, lastMessageAt: new Date() },
    update: {},
  });
  await prisma.message.createMany({
    data: [
      {
        conversationId: conversation.id,
        direction: 'in',
        body: c.text,
        status: 'received',
        externalId: `seed.${c.phone}`,
      },
    ],
    skipDuplicates: true,
  });
}

await prisma.template.upsert({
  where: { name_language: { name: 'order_update', language: 'en' } },
  create: {
    name: 'order_update',
    language: 'en',
    category: 'utility',
    body: 'Hi {{1}}, your order {{2}} is on its way.',
  },
  update: {},
});

await prisma.$disconnect();
console.log(`Seeded. Login: ${SEED_AGENT_EMAIL} / ${SEED_PASSWORD}`);
