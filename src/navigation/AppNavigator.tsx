import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppStore } from '@/store';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { Colors } from '@/constants/colors';

export type RootStackParamList = {
  Onboarding: undefined;
  Dashboard:  undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// AsyncStorage 복원(persist rehydration)은 비동기라 첫 렌더 시점엔
// onboarded가 항상 기본값(false)이다. 복원이 끝나기 전에 분기하면
// 이미 온보딩을 마친 사용자에게도 Onboarding 화면이 잠깐 보인다.
function useStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useAppStore.persist.hasHydrated());

  useEffect(() => {
    if (useAppStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useAppStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}

export default function AppNavigator() {
  const hydrated = useStoreHydrated();
  const onboarded = useAppStore(state => state.userSettings.onboarded);

  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: Colors.bgDefault }} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!onboarded ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
