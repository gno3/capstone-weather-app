import type { Forecast } from "../types";
import { describeWeather } from "../wmo";
import { getAiClient } from "./client";

export const SUMMARY_HOURS = 24;
export const SUMMARY_DAYS = 3;
export const SUMMARY_TEMPERATURE = 0.2;
export const SUMMARY_MAX_COMPLETION_TOKENS = 120;

export const SUMMARY_SYSTEM_PROMPT = [
  "You write a short weather briefing for a weather dashboard.",
  "Write 2-3 short sentences (never more than 3, and no more than 60 words in total) in plain language describing what matters for today and the next few days. Combine related points into one sentence rather than adding a fourth.",
  "Prioritize rain timing (when precipitation chances rise or fall), large temperature swings, and notable wind; skip anything unremarkable.",
  "Use only numbers that appear in the provided data. Do not invent, estimate, or convert any values.",
  "Keep units exactly as given in the data.",
  "Do not use emojis, markdown, lists, or headings.",
  "Only describe the weather; give no advice or recommendations beyond weather (no clothing, travel, health, or activity tips).",
  "Before answering, check that the briefing has at most 3 sentences.",
].join(" ");

export type SummaryInput = {
  location: string;
  timezone: string;
  units: { temperature: string; windSpeed: string; precipitation: string };
  current: {
    time: string;
    temperature: number | null;
    feelsLike: number | null;
    humidityPercent: number | null;
    windSpeed: number | null;
    windDirectionDeg: number | null;
    condition: string;
  };
  next24Hours: {
    time: string;
    temperature: number | null;
    precipitationChancePercent: number | null;
    condition: string;
  }[];
  next3Days: {
    date: string;
    high: number | null;
    low: number | null;
    precipitationChancePercent: number | null;
    condition: string;
  }[];
};

/** Compact, label-only view of the forecast sent to the model (no emojis, codes, or days 4+). */
export function buildSummaryInput(forecast: Forecast, locationName: string): SummaryInput {
  const { current, units } = forecast;
  return {
    location: locationName,
    timezone: forecast.timezone,
    units: {
      temperature: units.temperature,
      windSpeed: units.windSpeed,
      precipitation: units.precipitation,
    },
    current: {
      time: current.time,
      temperature: current.temperature,
      feelsLike: current.apparentTemperature,
      humidityPercent: current.humidity,
      windSpeed: current.windSpeed,
      windDirectionDeg: current.windDirection,
      condition: describeWeather(current.weatherCode, current.isDay).label,
    },
    next24Hours: forecast.hourly.slice(0, SUMMARY_HOURS).map((point) => ({
      time: point.time,
      temperature: point.temperature,
      precipitationChancePercent: point.precipitationProbability,
      condition: describeWeather(point.weatherCode).label,
    })),
    next3Days: forecast.daily.slice(0, SUMMARY_DAYS).map((day) => ({
      date: day.date,
      high: day.temperatureMax,
      low: day.temperatureMin,
      precipitationChancePercent: day.precipitationProbabilityMax,
      condition: describeWeather(day.weatherCode).label,
    })),
  };
}

/** Generates the briefing; client and empty-response errors propagate to the caller. */
export async function summarizeForecast(forecast: Forecast, locationName: string): Promise<string> {
  const { client, deployment } = getAiClient();
  const input = buildSummaryInput(forecast, locationName);

  const completion = await client.chat.completions.create({
    model: deployment,
    temperature: SUMMARY_TEMPERATURE,
    max_completion_tokens: SUMMARY_MAX_COMPLETION_TOKENS,
    messages: [
      { role: "system", content: SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: `Location: ${locationName}\n${JSON.stringify(input)}` },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Azure OpenAI returned an empty summary");
  return text;
}
