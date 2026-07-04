import type { CollectionConfig } from 'payload';

/**
 * Listings — the core marketplace object. A single item offered for sale.
 *
 * This is a deliberately small starting schema: enough to render a browse
 * grid and a detail page, and to grow from. Extend with pricing tiers,
 * categories, shipping, etc. as the marketplace takes shape.
 */
export const Listings: CollectionConfig = {
  slug: 'listings',
  labels: { singular: 'Listing', plural: 'Listings' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'price', 'status', 'updatedAt'],
  },
  access: {
    // Only published listings are publicly readable; admins/sellers see all.
    read: ({ req: { user } }) =>
      user ? true : { status: { equals: 'published' } },
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'URL segment, e.g. "vintage-tractor". Must be unique.' },
    },
    {
      name: 'price',
      type: 'number',
      required: true,
      min: 0,
      admin: { description: 'Price in whole pounds (GBP).' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Sold', value: 'sold' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'description', type: 'textarea' },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Main listing photo.' },
    },
    {
      name: 'seller',
      type: 'relationship',
      relationTo: 'users',
      admin: { position: 'sidebar' },
    },
  ],
};
