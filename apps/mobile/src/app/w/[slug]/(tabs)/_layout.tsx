import { Tabs } from 'expo-router';
import { CircleCheck, CircleEllipsis, Folder, Inbox, MessageSquareText } from 'lucide-react-native';
import type { ComponentType } from 'react';
import type { ColorValue } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../../theme/ThemeProvider';

type Icon = ComponentType<{ color?: ColorValue; size: number }>;

const icon =
  (Glyph: Icon) =>
  ({ color }: { color: ColorValue }) => <Glyph color={color} size={24} />;

/** Tab bar placeholder; B5 replaces it with the designed `TabBar` (badges, dot, FAB). */
export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accentInk,
        tabBarInactiveTintColor: theme.colors.iconMuted,
        tabBarStyle: {
          backgroundColor: theme.mobile.tabBar,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { ...theme.type.tab, fontFamily: theme.fontFor(500) },
      }}
    >
      <Tabs.Screen
        name="my-tasks"
        options={{ title: t('tabs.myTasks'), tabBarIcon: icon(CircleCheck) }}
      />
      <Tabs.Screen
        name="projects"
        options={{ title: t('tabs.projects'), tabBarIcon: icon(Folder) }}
      />
      <Tabs.Screen name="inbox" options={{ title: t('tabs.inbox'), tabBarIcon: icon(Inbox) }} />
      <Tabs.Screen
        name="standup"
        options={{ title: t('tabs.standup'), tabBarIcon: icon(MessageSquareText) }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: t('tabs.more'), tabBarIcon: icon(CircleEllipsis) }}
      />
    </Tabs>
  );
}
