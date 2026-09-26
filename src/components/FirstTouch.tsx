'use client';

import { useEffect } from 'react';
import { captureFirstTouch } from '@/lib/firstTouch';

/** Records where this tab's visitor came from. Renders nothing. */
export function FirstTouchCapture() {
  useEffect(() => captureFirstTouch(), []);
  return null;
}
