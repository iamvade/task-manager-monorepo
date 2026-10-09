import { FloatingTree, useFloatingParentNodeId } from '@floating-ui/react';
import type { ReactNode } from 'react';

/**
 * Starts a floating-ui tree unless one is already open above, so a popover opened from inside
 * the drawer (or another popover) is its child: clicks inside it don't dismiss the parent, and
 * Esc closes only the topmost layer.
 */
export function WithFloatingTree({ children }: { children: ReactNode }) {
  const parentId = useFloatingParentNodeId();
  return parentId === null ? <FloatingTree>{children}</FloatingTree> : <>{children}</>;
}
