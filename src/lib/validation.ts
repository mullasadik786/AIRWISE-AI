import { z } from 'zod';

export const LocationSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, 'Enter at least 2 characters to search a city or area.')
    .max(80, 'Location query is too long.'),
});

export const AirQualityQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  name: z.string().trim().min(1).max(100).optional(),
  region: z.string().trim().max(100).optional(),
  country: z.string().trim().max(80).optional(),
  countryCode: z.string().trim().max(10).optional(),
  timezone: z.string().trim().max(80).optional(),
});

export const HouseholdGroupSchema = z.enum([
  'adults',
  'children',
  'olderAdults',
  'respiratorySensitivities',
  'outdoorWorkers',
  'fitnessEnthusiasts',
  'workFromHome',
  'dailyCommuters',
]);

export const AssistantRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, 'Please ask a question of at least 3 characters.')
    .max(600, 'Please keep your question under 600 characters.'),
  locationName: z.string().trim().min(1).max(120),
  countryCode: z.string().trim().max(10).optional().default('IN'),
  cpcbAqi: z.number().min(0).max(1000).nullable(),
  cpcbCategory: z.string().trim().max(40),
  usAqi: z.number().min(0).max(1000).nullable(),
  pm25: z.number().min(0).max(3000).nullable(),
  pm10: z.number().min(0).max(3000).nullable(),
  no2: z.number().min(0).max(2000).nullable(),
  o3: z.number().min(0).max(2000).nullable(),
  temperatureC: z.number().min(-60).max(65).nullable(),
  humidityPercent: z.number().min(0).max(100).nullable(),
  windSpeedKmh: z.number().min(0).max(300).nullable(),
  dataStatus: z.enum(['LIVE', 'CACHED', 'DEMO_FALLBACK', 'UNAVAILABLE']),
  householdGroups: z.array(HouseholdGroupSchema).max(8),
});

export const AssistantOutputSchema = z.object({
  summary: z.string().min(10).max(1200),
  measuredFacts: z.array(z.string().min(3).max(300)).min(1).max(6),
  contextualEstimates: z.array(z.string().min(3).max(300)).min(1).max(5),
  recommendation: z.object({
    what: z.string().min(5).max(500),
    why: z.string().min(5).max(500),
    when: z.string().min(3).max(300),
    expectedBenefits: z.string().min(5).max(400),
    estimatedImpact: z.string().min(5).max(400),
    confidenceAndLimitations: z.string().min(5).max(400),
  }),
  actionSteps: z.array(z.string().min(3).max(300)).min(2).max(6),
  disclaimer: z.string().min(10).max(400),
});

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /reveal\s+(your\s+)?(system\s+prompt|api\s*key|secrets?|instructions)/i,
  /act\s+as\s+(a\s+)?(jailbreak|unrestricted|dan)/i,
  /execute\s+(shell|bash|code|command|eval)/i,
  /<\/?(script|system|assistant|tool_call)>/i,
];

export function sanitizeUserPrompt(raw: string): { sanitized: string; flagged: boolean } {
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const flagged = INJECTION_PATTERNS.some((pattern) => pattern.test(cleaned));
  return { sanitized: cleaned, flagged };
}
