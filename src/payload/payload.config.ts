import path from 'path';
import sharp from 'sharp';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { fileURLToPath } from 'url';

import { env } from '../lib/env';
import { Users } from './collections/users';
import { Media } from './collections/media';
import { Listings } from './collections/listings';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Payload CMS configuration.
 *
 * Database:  Postgres via node-postgres
 * Storage:   local (/media) in dev — add @payloadcms/storage-s3 for production
 * Auth:      Payload's built-in (Users collection)
 *
 * Env vars expected (see .env.local.example):
 *   DATABASE_URL
 *   PAYLOAD_SECRET
 */
export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ' — Emmerdale Marketplace Admin',
    },
  },

  editor: lexicalEditor({}),

  sharp,

  collections: [Users, Media, Listings],

  db: postgresAdapter({
    pool: {
      connectionString: env.DATABASE_URL,
    },
  }),

  secret: env.PAYLOAD_SECRET,

  typescript: {
    outputFile: path.resolve(dirname, '../../payload-types.ts'),
  },

  // Trust the host so Payload builds correct URLs in production
  serverURL: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
});
