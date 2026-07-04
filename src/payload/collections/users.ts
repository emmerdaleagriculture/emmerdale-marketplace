import type { CollectionConfig } from 'payload';

/**
 * Users — admin accounts. Payload's built-in auth handles password hashing,
 * sessions, and lockout. The first user is created on the /admin
 * "Create first user" screen after boot.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'User', plural: 'Users' },
  auth: {
    tokenExpiration: 7 * 24 * 60 * 60, // 7 days
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000, // 10 minutes
  },
  admin: {
    useAsTitle: 'email',
    group: 'Admin',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'seller',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Seller', value: 'seller' },
      ],
    },
  ],
};
