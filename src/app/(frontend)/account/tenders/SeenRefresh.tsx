'use client';

import { useEffect } from 'react';
import { tendersSeenAction } from './actions';

/** Once the list is on screen, clear the dashboard's cached tender count. */
export function SeenRefresh() {
  useEffect(() => {
    void tendersSeenAction();
  }, []);
  return null;
}
