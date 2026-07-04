import type { CollectionConfig } from 'payload';

/**
 * Media — every image or file upload.
 *
 * Alt text is required for accessibility and SEO. Payload enforces this at
 * the field level.
 *
 * Storage: in development, files are stored locally under /media/ (gitignored).
 * For production, add the @payloadcms/storage-s3 plugin in payload.config.ts
 * and point it at your object store.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Media', plural: 'Media' },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'alt', 'updatedAt'],
  },
  access: {
    // Public read — the frontend renders these images on listing pages.
    read: () => true,
  },
  upload: {
    // Generate responsive sizes for <picture>/srcset
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre' },
      { name: 'card', width: 768, height: 512, position: 'centre' },
      { name: 'feature', width: 1200, height: 800, position: 'centre' },
    ],
    formatOptions: {
      format: 'webp',
      options: { quality: 82 },
    },
    adminThumbnail: 'thumbnail',
    mimeTypes: ['image/*'],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: {
        description:
          'Describe the image in one short sentence for screen readers and SEO. Required.',
      },
    },
    {
      name: 'caption',
      type: 'text',
      admin: { description: 'Optional caption shown with the image.' },
    },
  ],
};
