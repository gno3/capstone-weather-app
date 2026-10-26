export type Location = {
  name: string;
  region?: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
};

export type UnitSystem = "imperial" | "metric";

export type ForecastUnits = {
  system: UnitSystem;
  temperature: "°F" | "°C";
  windSpeed: "mph" | "km/h";
  precipitation: "in" | "mm";
};

/** Times are provider-local ISO strings without offsets (e.g. "2026-10-26T14:00"). */
export type CurrentConditions = {
  time: string;
  temperature: number | null;
  apparentTemperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  weatherCode: number | null;
  isDay: boolean;
};

export type HourlyPoint = {
  time: string;
  temperature: number | null;
  precipitationProbability: number | null;
  weatherCode: number | null;
};

export type DailySummary = {
  date: string;
  weatherCode: number | null;
  temperatureMax: number | null;
  temperatureMin: number | null;
  precipitationProbabilityMax: number | null;
  sunrise: string | null;
  sunset: string | null;
};

export type Forecast = {
  timezone: string;
  units: ForecastUnits;
  current: CurrentConditions;
  hourly: HourlyPoint[];
  daily: DailySummary[];
};
