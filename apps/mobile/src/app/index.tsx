import { Redirect } from 'expo-router';

// B3 replaces this with the session check (signed in → the last workspace's My Tasks).
export default function Index() {
  return <Redirect href="/sign-in" />;
}
