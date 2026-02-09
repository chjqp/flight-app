import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1a73e8' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ title: '✈️ 机票助手', headerShown: false }} />
      <Stack.Screen name="results" options={{ title: '搜索结果' }} />
      <Stack.Screen name="booking" options={{ title: '订票' }} />
    </Stack>
  );
}
