import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CurrentWeather, WeatherAlert, WeatherSlot, WeatherType, TimelineHint } from '@/types';
import { getCurrentSlotIndex } from '@/utils/time';
import { latLonToGrid } from '@/utils/kmaGrid';
import { formatLocalDate, pickForecastDate } from './forecastDate';
import { getSidoFromCoords } from '@/utils/sido';
import { AirQualityService } from '@/services/airQuality/AirQualityService';

const KMA_API_KEY = process.env.EXPO_PUBLIC_KMA_API_KEY ?? '';
const KMA_BASE_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const CACHE_KEY = 'weather_cache';
const TIMELINE_CACHE_KEY = 'weather_timeline_cache';
const CACHE_TTL_MS = 1000 * 60 * 30; // 30분

interface KmaItem {
  category: string;
  obsrValue?: string;
  fcstValue?: string;
  fcstDate?: string;  // "YYYYMMDD" — 단기예보는 최대 +3일치를 함께 돌려주므로 반드시 본다
  fcstTime?: string;
}

// 초단기실황(getUltraSrtNcst) — 매시 40분에 해당 시각 데이터가 공개됨
function getUltraSrtNcstBaseTime(now: Date): { base_date: string; base_time: string } {
  const d = new Date(now);
  if (d.getMinutes() < 40) d.setHours(d.getHours() - 1);
  return { base_date: formatLocalDate(d), base_time: `${String(d.getHours()).padStart(2, '0')}00` };
}

// 단기예보(getVilageFcst) — 02/05/08/11/14/17/20/23시, 발표 후 약 10분 뒤 공개
const VILAGE_BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];

function getVilageFcstBaseTime(now: Date): { base_date: string; base_time: string } {
  const d = new Date(now);
  const minutesNow = d.getHours() * 60 + d.getMinutes() - 10; // 10분 발표 지연 버퍼
  const hour = [...VILAGE_BASE_HOURS].reverse().find((h) => h * 60 <= minutesNow);

  if (hour === undefined) {
    d.setDate(d.getDate() - 1);
    return { base_date: formatLocalDate(d), base_time: '2300' };
  }
  return { base_date: formatLocalDate(d), base_time: `${String(hour).padStart(2, '0')}00` };
}

// PTY(강수형태) → 앱의 WeatherType. 눈 계열(2,3,6,7)은 WeatherType에 별도 값이 없어 'drizzle'로 대체.
function ptyToWeatherType(pty: number): WeatherType | null {
  if (pty === 0) return null;
  if (pty === 1 || pty === 4 || pty === 5) return 'rainy';
  return 'drizzle';
}

function skyToWeatherType(sky: number): WeatherType {
  return sky === 1 ? 'sunny' : 'cloudy';
}

function weatherLabel(type: WeatherType): string {
  switch (type) {
    case 'sunny': return '맑음';
    case 'cloudy': return '흐림';
    case 'rainy': return '비';
    case 'drizzle': return '눈/약한 비';
    case 'hot': return '폭염';
    default: return '흐림';
  }
}

function getRecommendation(temp: number): { text: string; emoji: string } {
  if (temp >= 28) return { text: '덥고 습해요. 반팔에 가벼운 옷차림을 추천해요.', emoji: '🩳' };
  if (temp >= 23) return { text: '가볍게 얇은 긴팔 하나면 딱입니다.', emoji: '👔' };
  if (temp >= 17) return { text: '가벼운 겉옷이나 니트를 추천해요.', emoji: '🧥' };
  if (temp >= 9) return { text: '자켓이나 가디건을 챙기세요.', emoji: '🧥' };
  return { text: '두꺼운 패딩과 목도리가 필요해요.', emoji: '🧣' };
}

function toItemMap(items: KmaItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of items) {
    map[item.category] = item.obsrValue ?? item.fcstValue ?? '';
  }
  return map;
}

export const WeatherService = {

  // 현재 날씨 조회 (초단기실황)
  // 서비스키 미설정 또는 실패 시 캐시된 마지막 값 반환
  async getCurrentWeather(lat: number, lon: number): Promise<CurrentWeather | null> {
    if (!KMA_API_KEY) return WeatherService._getCache();

    try {
      const { nx, ny } = latLonToGrid(lat, lon);
      const { base_date, base_time } = getUltraSrtNcstBaseTime(new Date());

      const [response, dustLevel] = await Promise.all([
        axios.get(`${KMA_BASE_URL}/getUltraSrtNcst`, {
          params: {
            serviceKey: KMA_API_KEY,
            numOfRows: 10,
            pageNo: 1,
            dataType: 'JSON',
            base_date,
            base_time,
            nx,
            ny,
          },
          timeout: 5000,
        }),
        AirQualityService.getDustLevel(getSidoFromCoords(lat, lon)),
      ]);

      const header = response.data?.response?.header;
      if (header?.resultCode !== '00') {
        throw new Error(header?.resultMsg ?? 'KMA API error');
      }

      const items: KmaItem[] = response.data?.response?.body?.items?.item ?? [];
      const values = toItemMap(items);

      const temp = Number(values.T1H ?? 0);
      const humidity = Number(values.REH ?? 0);
      const wind = Number(values.WSD ?? 0);
      const pty = Number(values.PTY ?? 0);

      const precipType = ptyToWeatherType(pty);
      const isHeat = temp >= 33;
      const weatherType: WeatherType = isHeat ? 'hot' : precipType ?? 'sunny';
      const { text, emoji } = getRecommendation(temp);

      const weather: CurrentWeather = {
        label: `${weatherLabel(weatherType)} · ${temp}°C`,
        weather: weatherType,
        temp,
        humidity,
        wind,
        dustLevel,
        rainAlert: pty !== 0,
        heatAlert: isHeat,
        recommendation: text,
        recommendEmoji: emoji,
        calendarEvents: [],
      };

      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
        data: weather,
        timestamp: Date.now(),
      }));

      return weather;
    } catch {
      // 네트워크/키 실패 → 캐시 반환
      return WeatherService._getCache();
    }
  },

  // 시간대별 날씨 타임라인 조회 (단기예보 · 오전/정오/오후/저녁/밤 5슬롯)
  async getTimeline(lat: number, lon: number): Promise<WeatherSlot[]> {
    if (!KMA_API_KEY) return WeatherService._getTimelineCache();

    try {
      const { nx, ny } = latLonToGrid(lat, lon);
      const { base_date, base_time } = getVilageFcstBaseTime(new Date());

      const response = await axios.get(`${KMA_BASE_URL}/getVilageFcst`, {
        params: {
          serviceKey: KMA_API_KEY,
          numOfRows: 1000,
          pageNo: 1,
          dataType: 'JSON',
          base_date,
          base_time,
          nx,
          ny,
        },
        timeout: 8000,
      });

      const header = response.data?.response?.header;
      if (header?.resultCode !== '00') {
        throw new Error(header?.resultMsg ?? 'KMA API error');
      }

      const items: KmaItem[] = response.data?.response?.body?.items?.item ?? [];

      // 단기예보는 최대 +3일치를 한 번에 돌려준다. fcstTime("1200")만으로 맵을 만들면
      // 오늘·내일·모레의 같은 시각이 서로를 덮어써서, "오늘 시간대별 날씨" 자리에
      // 내일이나 모레 값이 뜬다. 반드시 한 날짜의 예보만 골라 쓴다.
      //
      // 오늘 것이 있으면 오늘, 없으면 가장 이른 날짜를 쓴다. 23시 발표분은 예보가
      // 다음 날 00시부터 시작해서 오늘 항목이 아예 없는데, 그 시각엔 5개 슬롯이
      // 모두 지난 뒤라 다가오는 날을 보여주는 쪽이 맞다.
      const targetDate = pickForecastDate(items, new Date());

      const byTime = new Map<string, Record<string, string>>();
      for (const item of items) {
        if (item.fcstDate !== targetDate) continue;
        const time = item.fcstTime ?? '';
        if (!byTime.has(time)) byTime.set(time, {});
        byTime.get(time)![item.category] = item.fcstValue ?? '';
      }
      const availableTimes = [...byTime.keys()].sort();

      const targets: Array<{ label: string; hour: number }> = [
        { label: '오전', hour: 9 },
        { label: '정오', hour: 12 },
        { label: '오후', hour: 15 },
        { label: '저녁', hour: 18 },
        { label: '밤', hour: 21 },
      ];

      const slots: WeatherSlot[] = targets.map(({ label, hour }) => {
        const wanted = `${String(hour).padStart(2, '0')}00`;
        const matched =
          availableTimes.find((t) => t >= wanted) ?? availableTimes[availableTimes.length - 1] ?? wanted;
        const values = byTime.get(matched) ?? {};

        const temp = Number(values.TMP ?? 0);
        const pty = Number(values.PTY ?? 0);
        const sky = Number(values.SKY ?? 1);
        const rain = Number(values.POP ?? 0);

        const precipType = ptyToWeatherType(pty);
        const type: WeatherType = temp >= 33 ? 'hot' : precipType ?? skyToWeatherType(sky);
        const alert: WeatherAlert = pty !== 0 ? 'rain' : temp >= 33 ? 'heat' : null;

        return { label, temp, type, rain, alert };
      });

      // 아침 대비 5도 이상 하락하는 슬롯에 'cold' 경보 부여 (비/폭염 경보는 유지)
      const morningTemp = slots[0]?.temp ?? 0;
      slots.forEach((slot, i) => {
        if (slot.alert === null && i > 0 && morningTemp - slot.temp >= 5) {
          slot.alert = 'cold';
        }
      });

      await AsyncStorage.setItem(TIMELINE_CACHE_KEY, JSON.stringify({
        data: slots,
        timestamp: Date.now(),
      }));

      return slots;
    } catch {
      return WeatherService._getTimelineCache();
    }
  },

  // 타임라인 힌트 생성 (착장 추천 연동)
  getTimelineHint(slots: WeatherSlot[]): TimelineHint | null {
    const currentSlot = getCurrentSlotIndex();
    const futureSlots = slots.slice(currentSlot + 1);

    const rainLater = futureSlots.some(s => s.alert === 'rain');
    const coldLater = futureSlots.some(s => s.alert === 'cold');
    const minTemp   = Math.min(...futureSlots.map(s => s.temp));
    const tempDrop  = (slots[currentSlot]?.temp ?? 0) - minTemp;

    if (rainLater) {
      return {
        text:  '저녁에 비 예보 — 우산을 가방에 미리 넣어두세요.',
        color: '#0369a1',
        bg:    '#f0f9ff',
      };
    }
    if (coldLater && tempDrop >= 5) {
      return {
        text:  `저녁 기온이 ${tempDrop}°C 급강하 — 얇은 겉옷을 챙기세요.`,
        color: '#1d4ed8',
        bg:    '#eff6ff',
      };
    }
    return null;
  },

  // 캐시 조회 (30분 이내 유효)
  async _getCache(): Promise<CurrentWeather | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { data, timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp > CACHE_TTL_MS) return null;
      return data;
    } catch {
      return null;
    }
  },

  // 타임라인 캐시 조회 (30분 이내 유효)
  async _getTimelineCache(): Promise<WeatherSlot[]> {
    try {
      const raw = await AsyncStorage.getItem(TIMELINE_CACHE_KEY);
      if (!raw) return [];
      const { data, timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp > CACHE_TTL_MS) return [];
      return data;
    } catch {
      return [];
    }
  },
};
