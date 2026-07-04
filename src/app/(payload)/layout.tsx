/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Payload admin layout — wraps /admin routes with Payload's providers.
 */
import type { Metadata } from 'next';
import config from '@payload-config';
import { RootLayout, handleServerFunctions } from '@payloadcms/next/layouts';
import { importMap } from './admin/importMap';

import '@payloadcms/next/css';
import './custom.css';

type Args = { children: React.ReactNode };

export const metadata: Metadata = {
  title: 'Emmerdale Marketplace Admin',
  description: 'Emmerdale Marketplace — admin',
};

const serverFunction = async (args: any) => {
  'use server';
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  });
};

const Layout = ({ children }: Args) =>
  (<RootLayout
    config={config}
    importMap={importMap}
    serverFunction={serverFunction}
  >
    {children}
  </RootLayout>);

export default Layout;
