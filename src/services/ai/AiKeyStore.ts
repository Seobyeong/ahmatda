// 아맞다 — AI API 키 보관 (기기 보안 저장소: iOS Keychain / Android Keystore)
//
// 키는 AsyncStorage·Zustand persist에 절대 넣지 않는다. 로그·에러 메시지에도 남기지 않는다.

import * as SecureStore from 'expo-secure-store';
import type { AiProviderId } from '@/types';

// 백그라운드 fetch(전날 밤 미리 계산)는 화면이 잠긴 상태에서도 키를 읽어야 한다.
// 기본값 WHEN_UNLOCKED이면 잠금 중 읽기가 실패하므로 "재부팅 후 첫 잠금 해제 이후"로 둔다.
// THIS_DEVICE_ONLY — 백업으로 다른 기기에 옮겨지지 않게 한다(키는 기기마다 다시 입력).
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const keyName = (provider: AiProviderId) => `ai.${provider}.apiKey`;

export const AiKeyStore = {
  async get(provider: AiProviderId): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(keyName(provider), OPTIONS);
    } catch {
      return null;
    }
  },

  async set(provider: AiProviderId, apiKey: string): Promise<boolean> {
    try {
      await SecureStore.setItemAsync(keyName(provider), apiKey.trim(), OPTIONS);
      return true;
    } catch {
      return false;
    }
  },

  async remove(provider: AiProviderId): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(keyName(provider), OPTIONS);
    } catch {
      // 이미 없으면 그대로 둔다
    }
  },
};
