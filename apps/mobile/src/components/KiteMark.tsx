import { Image } from 'react-native';
import markBlack from '../../assets/kite-mark-black.png';
import markWhite from '../../assets/kite-mark-white.png';
import { useTheme } from '../theme/ThemeProvider';

const MARK = { light: markBlack, dark: markWhite };

/** The Kite logo mark (decorative): black on light, white on dark (the logo exports). */
export function KiteMark({ size }: { size: number }) {
  const theme = useTheme();
  return <Image source={MARK[theme.scheme]} style={{ width: size, height: size }} />;
}
