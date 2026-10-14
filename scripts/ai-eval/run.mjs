// AI 연결 설계(docs/AI-연결-설계.md) 8장 검증 1 — 미분류 일정 해석의 모델·effort 비교.
//
// 앱과 똑같은 요청을 보낸다: 공식 SDK가 React Native를 지원하지 않아 앱은 fetch로
// 직접 호출할 예정이므로, 여기서도 SDK 없이 같은 HTTP 요청을 만든다.
//
//   node scripts/ai-eval/run.mjs --dry     # 무료 — 평가셋 점검 + 요청 본문 출력
//   ANTHROPIC_API_KEY=... node scripts/ai-eval/run.mjs   # 유료 — 설정별 실제 호출
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const evalSet = JSON.parse(readFileSync(path.join(here, 'eval-set.json'), 'utf8'));

const PURPOSE_IDS = ['work', 'workout', 'study', 'date', 'trip'];
const BATCH_SIZE = 3; // 앱은 하루치 미분류 일정을 한 요청에 묶는다 — 보통 1~3개

// 비교할 설정. 가격은 2026-10 Claude 공식가($/1M 토큰, 입력 100K 이하 기준).
const CONFIGS = [
  { name: 'haiku-5-5 / thinking off', model: 'claude-haiku-5-5', price: [0.10, 0.50],
    extra: { thinking: { type: 'disabled' }, output_config: { effort: 'low' } } },
  { name: 'haiku-5-5 / effort low',   model: 'claude-haiku-5-5', price: [0.10, 0.50],
    extra: { output_config: { effort: 'low' } } },
  { name: 'sonnet-5-5 / effort low',  model: 'claude-sonnet-5-5', price: [2.00, 10.00],
    extra: { output_config: { effort: 'low' } } },
];

// 고정 프롬프트 — 짧게 유지하는 게 핵심 (512토큰 미만이라 프롬프트 캐싱은 어차피 안 걸림)
const SYSTEM = [
  '외출 준비 앱이다. 일정 제목마다 외출 목적과, 그 일정 때문에 추가로 챙길 준비물을 고른다.',
  '목적: work(출근·업무), workout(운동), study(공부·시험), date(약속·모임·공연), trip(여행·나들이). 어디에도 안 맞으면 null.',
  '준비물: 지갑·휴대폰·열쇠처럼 매일 챙기는 것은 빼고, 이 일정이라 필요한 것만 0~3개. 각각 짧은 명사.',
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer' },
          purpose: { anyOf: [{ type: 'string', enum: PURPOSE_IDS }, { type: 'null' }] },
          // maxItems는 구조화 출력이 지원하지 않는다 → 받은 뒤 3개로 자른다
          items: { type: 'array', items: { type: 'string' } },
        },
        required: ['i', 'purpose', 'items'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

function buildBody(model, extra, titles) {
  return {
    model,
    max_tokens: 1024, // 측정용 여유값 — 실제 output_tokens를 보고 앱 값은 낮춘다
    system: SYSTEM,
    messages: [{ role: 'user', content: titles.map((t, i) => `${i}: ${t}`).join('\n') }],
    ...extra,
    output_config: {
      ...(extra.output_config ?? {}),
      format: { type: 'json_schema', schema: SCHEMA },
    },
  };
}

// 평가셋이 실제로 "로컬 키워드에 안 걸리는" 제목인지 확인 — 걸리면 앱은 AI를 안 부른다
function checkAgainstLocalKeywords() {
  const src = readFileSync(path.join(root, 'src/constants/purposes.ts'), 'utf8');
  const keywords = [...src.matchAll(/calKeywords:\s*\[([^\]]*)\]/g)]
    .flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(k => k[1]));
  const hits = evalSet.filter(e => keywords.some(k => e.title.includes(k)));
  if (hits.length) {
    console.error('로컬 키워드에 걸리는 제목이 있다 (평가셋에서 빼야 함):', hits.map(h => h.title));
    process.exit(1);
  }
  console.log(`평가셋 ${evalSet.length}개 — 모두 로컬 키워드 미매칭 확인 (키워드 ${keywords.length}개)`);
}

async function callOnce(cfg, titles) {
  const started = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildBody(cfg.model, cfg.extra, titles)),
  });
  const ms = Date.now() - started;
  const json = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json.error ?? json)}`);
  if (json.stop_reason !== 'end_turn') throw new Error(`stop_reason=${json.stop_reason}`);
  const text = json.content.find(b => b.type === 'text')?.text ?? '';
  return { ms, usage: json.usage, results: JSON.parse(text).results };
}

async function runConfig(cfg) {
  let correct = 0, itemHit = 0, itemGraded = 0, inTok = 0, outTok = 0, calls = 0, errors = 0;
  const latencies = [];
  const misses = [];
  for (let start = 0; start < evalSet.length; start += BATCH_SIZE) {
    const batch = evalSet.slice(start, start + BATCH_SIZE);
    try {
      const r = await callOnce(cfg, batch.map(e => e.title));
      calls++; latencies.push(r.ms);
      inTok += r.usage.input_tokens; outTok += r.usage.output_tokens;
      batch.forEach((e, i) => {
        const got = r.results.find(x => x.i === i);
        const purpose = got?.purpose ?? null;
        const items = (got?.items ?? []).slice(0, 3);
        if (e.accept.includes(purpose)) correct++;
        else misses.push(`${e.title}: ${purpose} (기대 ${e.accept.join('/')})`);
        if (e.itemsAny.length) {
          itemGraded++;
          if (items.some(it => e.itemsAny.some(k => it.includes(k)))) itemHit++;
        }
        console.log(`  ${e.title} → ${purpose} [${items.join(', ')}]`);
      });
    } catch (err) {
      errors++;
      console.log(`  오류: ${err.message}`);
    }
  }
  latencies.sort((a, b) => a - b);
  const cost = (inTok * cfg.price[0] + outTok * cfg.price[1]) / 1e6;
  return {
    name: cfg.name,
    purposeAcc: `${correct}/${evalSet.length}`,
    itemHit: `${itemHit}/${itemGraded}`,
    avgIn: calls ? Math.round(inTok / calls) : 0,
    avgOut: calls ? Math.round(outTok / calls) : 0,
    p50ms: latencies[Math.floor(latencies.length / 2)] ?? 0,
    maxMs: latencies.at(-1) ?? 0,
    costPerCall: calls ? `$${(cost / calls).toFixed(6)}` : '-',
    errors,
    misses,
  };
}

checkAgainstLocalKeywords();

if (process.argv.includes('--dry')) {
  const sample = buildBody(CONFIGS[0].model, CONFIGS[0].extra, evalSet.slice(0, BATCH_SIZE).map(e => e.title));
  console.log('\n요청 본문 예시:\n' + JSON.stringify(sample, null, 2));
  console.log(`\n실행 시 호출 수: 설정 ${CONFIGS.length}개 × 요청 ${Math.ceil(evalSet.length / BATCH_SIZE)}개`);
  process.exit(0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY가 없다. --dry로 점검만 하거나 키를 넣고 실행.');
  process.exit(1);
}

const summary = [];
for (const cfg of CONFIGS) {
  console.log(`\n== ${cfg.name}`);
  summary.push(await runConfig(cfg));
}
console.log('\n== 요약');
console.table(summary.map(({ misses, ...row }) => row));
for (const s of summary) if (s.misses.length) console.log(`\n${s.name} 오답:\n  ${s.misses.join('\n  ')}`);
