import { Stack } from 'expo-router';

/** Everything inside a workspace (`/w/:slug/...`, same paths as the web). */
export default function WorkspaceLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
