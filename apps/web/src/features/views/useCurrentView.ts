import { useLocation } from 'react-router';
import { VIEWS, type View } from './views';

/** The view segment at the end of /p/:id/<view> or /s/:id/<view>. */
export function useCurrentView(): View {
  const { pathname } = useLocation();
  const last = pathname.split('/').filter(Boolean).at(-1);
  return VIEWS.find((v) => v === last) ?? 'list';
}
