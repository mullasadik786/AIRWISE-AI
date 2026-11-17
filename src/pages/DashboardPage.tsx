import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Cloud, Droplets, Eye, Table, Thermometer, Wind } from 'lucide-react';
import type { EnvironmentalSnapshot, PageId } from '../types/airwise.ts';
import { getCpcbCategoryMeta, WHO_2021_GUIDELINES } from '../lib/aqi.ts';
import { analyzePollutionInsights } from '../lib/recommendations.ts';
import { LocationSelector } from '../components/LocationSelector.tsx';
import { DataStatusBanner } from '../components/DataStatusBanner.tsx';
import { AqiStatusBadge } from '../components/AqiBadge.tsx';
import { AirQualityMap } from '../components/AirQualityMap.tsx';
import { AccessibleHourlyTable } from '../components/AccessibleHourlyTable.tsx';

interface DashboardPageProps {
  snapshot: EnvironmentalSnapshot;
  loading: boolean;
  indoorProgressPercent: number;
  sustainabilityScore: number;
  weeklyCo2SavedKg: number;
  onSelectLocation: (loc: EnvironmentalSnapshot['location']) => void;
  onRefresh: () => void;
  onNavigate: (page: PageId) => void;
}

export function DashboardPage({
  snapshot,
  loading,
  indoorProgressPercent,
  sustainabilityScore,
  weeklyCo2SavedKg,
  onSelectLocation,
  onRefresh,
  onNavigate,
}: DashboardPageProps) {
  const [showAccessibleTable, setShowAccessibleTable] = useState(false);

  const meta = getCpcbCategoryMeta(snapshot.cpcbCategory);
  const insights = analyzePollutionInsights(snapshot);

  const pollutantsList = [
    {
      key: 'PM2.5',
      value: snapshot.pollutants.pm25,
      unit: 'µg/m³',
      whoLimit: WHO_2021_GUIDELINES.pm25_24h,
      ratio: snapshot.whoRatios.pm25Multiple,
    },
    {
      key: 'PM10',
      value: snapshot.pollutants.pm10,
      unit: 'µg/m³',
      whoLimit: WHO_2021_GUIDELINES.pm10_24h,
      ratio: snapshot.whoRatios.pm10Multiple,
    },
    {
      key: 'NO2',
      value: snapshot.pollutants.no2,
      unit: 'µg/m³',
      whoLimit: WHO_2021_GUIDELINES.no2_24h,
      ratio: snapshot.whoRatios.no2Multiple,
    },
    {
      key: 'SO2',
      value: snapshot.pollutants.so2,
      unit: 'µg/m³',
      whoLimit: WHO_2021_GUIDELINES.so2_24h,
      ratio: null,
    },
    {
      key: 'CO',
      value: snapshot.pollutants.co,
      unit: 'mg/m³',
      whoLimit: null,
      ratio: null,
    },
    {
      key: 'O3',
      value: snapshot.pollutants.o3,
      unit: 'µg/m³',
      whoLimit: WHO_2021_GUIDELINES.o3_8h,
      ratio: snapshot.whoRatios.o3Multiple,
    },
  ];

  const chartData = snapshot.hourly.map((h) => ({
    label: h.label,
    pm25: h.pm25,
    pm10: h.pm10,
    cpcbAqi: h.cpcbAqi,
    phase: h.isForecast ? 'Forecast' : 'Observed',
  }));

  return (
    <div className="space-y-6">
      <LocationSelector currentLocation={snapshot.location} onSelectLocation={onSelectLocation} />

      <DataStatusBanner snapshot={snapshot} loading={loading} onRefresh={onRefresh} />

      {/* Primary AQI Hero Summary + CPCB vs US AQI vs WHO Distinction */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12" aria-label="Air Quality Summary">
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                Indian CPCB NAQI Scale (0–500) · Dominant Pollutant: {snapshot.dominantPollutant}
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-4">
                <span className="font-mono text-5xl font-bold tracking-tight text-[#102A43] tabular-nums">
                  {snapshot.cpcbAqi ?? '—'}
                </span>
                <AqiStatusBadge category={snapshot.cpcbCategory} aqi={snapshot.cpcbAqi} />
              </div>
              <p className="mt-3 text-sm text-slate-700">{meta.healthSummary}</p>
            </div>
          </div>

          {/* 6-Category CPCB Reference Bar */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold text-slate-500">Official CPCB / NAQI Categories</p>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-6">
              {[
                { name: 'Good', range: '0–50', color: 'bg-[#20C997]' },
                { name: 'Satisfactory', range: '51–100', color: 'bg-[#38BDF8]' },
                { name: 'Moderate', range: '101–200', color: 'bg-[#F59E0B]' },
                { name: 'Poor', range: '201–300', color: 'bg-orange-600' },
                { name: 'Very Poor', range: '301–400', color: 'bg-[#EF4444]' },
                { name: 'Severe', range: '401–500', color: 'bg-rose-900' },
              ].map((cat) => {
                const isCurrent = snapshot.cpcbCategory === cat.name;
                return (
                  <div
                    key={cat.name}
                    className={`rounded-md border px-2 py-1.5 ${
                      isCurrent ? 'border-[#102A43] bg-slate-50 font-semibold' : 'border-slate-200'
                    }`}
                  >
                    <div className={`mb-1 h-1.5 w-full rounded-full ${cat.color}`} aria-hidden="true" />
                    <div className="text-[#102A43] truncate">{cat.name}</div>
                    <div className="font-mono text-slate-500 tabular-nums">{cat.range}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Standard Comparison & Weather */}
        <div className="grid grid-cols-1 gap-4 lg:col-span-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-display text-sm font-bold text-[#102A43]">
              Index Comparison: CPCB vs US AQI vs WHO
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-[#F4F8FB] p-3">
                <span className="block text-[11px] font-medium text-slate-500">Indian CPCB</span>
                <span className="mt-1 block font-mono text-xl font-bold text-[#102A43] tabular-nums">
                  {snapshot.cpcbAqi ?? 'N/A'}
                </span>
                <span className="text-[11px] text-slate-600">{snapshot.cpcbCategory}</span>
              </div>
              <div className="rounded-lg bg-[#F4F8FB] p-3">
                <span className="block text-[11px] font-medium text-slate-500">US EPA AQI</span>
                <span className="mt-1 block font-mono text-xl font-bold text-[#102A43] tabular-nums">
                  {snapshot.usAqi ?? 'N/A'}
                </span>
                <span className="text-[11px] leading-tight text-slate-600 block">{snapshot.usCategory}</span>
              </div>
              <div className="rounded-lg bg-[#F4F8FB] p-3">
                <span className="block text-[11px] font-medium text-slate-500">WHO PM2.5</span>
                <span className="mt-1 block font-mono text-xl font-bold text-[#102A43] tabular-nums">
                  {snapshot.whoRatios.pm25Multiple !== null ? `${snapshot.whoRatios.pm25Multiple}x` : 'N/A'}
                </span>
                <span className="text-[11px] text-slate-600">of 15 µg/m³</span>
              </div>
            </div>
            <p className="mt-2.5 text-xs text-slate-500">
              US AQI uses stricter 2024 PM2.5 breakpoints and a 0–500 scale peaking earlier than CPCB NAQI; WHO guidelines represent 24-hour health benchmarks.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-[#102A43]">Current Weather Context</h2>
              <span className="text-xs text-slate-500">{snapshot.weather.weatherSummary}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
                <div>
                  <span className="block text-[11px] text-slate-500">Temp</span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {snapshot.weather.temperatureC !== null ? `${snapshot.weather.temperatureC}°C` : 'N/A'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Droplets className="h-4 w-4 text-sky-600 shrink-0" aria-hidden="true" />
                <div>
                  <span className="block text-[11px] text-slate-500">Humidity</span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {snapshot.weather.humidityPercent !== null ? `${snapshot.weather.humidityPercent}%` : 'N/A'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Wind className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <div>
                  <span className="block text-[11px] text-slate-500">Wind</span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {snapshot.weather.windSpeedKmh !== null ? `${snapshot.weather.windSpeedKmh} km/h` : 'N/A'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-slate-600 shrink-0" aria-hidden="true" />
                <div>
                  <span className="block text-[11px] text-slate-500">Visibility</span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {snapshot.weather.visibilityKm !== null ? `${snapshot.weather.visibilityKm} km` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6 Pollutants Grid */}
      <section aria-label="Pollutant Concentrations">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-[#102A43]">
            Measured & Modeled Pollutant Breakdown
          </h2>
          <span className="text-xs text-slate-500">Compared against WHO 2021 24h/8h guidelines</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {pollutantsList.map((p) => (
            <div key={p.key} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-[#102A43]">{p.key}</span>
                <span>{p.unit}</span>
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-[#102A43] tabular-nums">
                {p.value !== null ? p.value : 'N/A'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {p.whoLimit !== null
                  ? `WHO limit: ${p.whoLimit} ${p.unit}${p.ratio ? ` (${p.ratio}x)` : ''}`
                  : '8-hr CO guideline'}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Household Readiness KPI Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Household Action Metrics">
        <button
          type="button"
          onClick={() => onNavigate('indoor')}
          className="rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#38BDF8]"
        >
          <p className="text-xs font-semibold text-slate-500">Indoor Air Checklist Progress</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#102A43] tabular-nums">
            {indoorProgressPercent}%
          </p>
          <p className="mt-1 text-xs text-slate-600">Review bedroom, kitchen & purifier tasks</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('sustainability')}
          className="rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#20C997]"
        >
          <p className="text-xs font-semibold text-slate-500">Household Sustainability Score</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#102A43] tabular-nums">
            {sustainabilityScore} / 100
          </p>
          <p className="mt-1 text-xs text-slate-600">Based on adopted low-emission habits</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('calculator')}
          className="rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#38BDF8]"
        >
          <p className="text-xs font-semibold text-slate-500">Estimated Weekly Carbon Savings</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#20C997] tabular-nums">
            {weeklyCo2SavedKg.toFixed(1)} kg CO2e
          </p>
          <p className="mt-1 text-xs text-slate-600">Open calculator for annual & community impact</p>
        </button>
      </section>

      {/* Charts: PM2.5 & PM10 Historical + Forecast Trend & Category Distribution */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12" aria-label="Pollution Trends and Distribution">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-[#102A43]">
                48-Hour Particulate Trend (Observed + Provider Forecast)
              </h2>
              <p className="text-xs text-slate-500">
                Hourly PM2.5 and PM10 concentrations in µg/m³ ({snapshot.location.name})
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAccessibleTable((v) => !v)}
              aria-expanded={showAccessibleTable}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-[#102A43] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
            >
              <Table className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showAccessibleTable ? 'Hide Data Table' : 'Accessible Table'}</span>
            </button>
          </div>

          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} unit=" µg" />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    borderColor: '#CBD5E1',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pm10"
                  name="PM10 (µg/m³)"
                  stroke="#38BDF8"
                  fill="#38BDF8"
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="pm25"
                  name="PM2.5 (µg/m³)"
                  stroke="#102A43"
                  fill="#20C997"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {showAccessibleTable && (
            <AccessibleHourlyTable rows={chartData} mode="particulates" />
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
          <h2 className="font-display text-base font-bold text-[#102A43]">
            AQI Category Distribution
          </h2>
          <p className="text-xs text-slate-500">Hours per CPCB category in 48h window</p>
          <div className="mt-4 h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insights.categoryDistribution} layout="vertical" margin={{ left: 10, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: '#102A43' }} width={86} />
                <Tooltip />
                <Bar dataKey="hours" name="Hours" radius={[0, 4, 4, 0]}>
                  {insights.categoryDistribution.map((entry) => (
                    <Cell key={entry.category} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-[#102A43]">3-Day Daily Outlook</p>
            {snapshot.daily.map((day) => (
              <div key={day.date} className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{day.label}</span>
                <span className="font-mono text-slate-500 tabular-nums">
                  {day.avgPm25 !== null ? `${day.avgPm25} µg/m³` : 'N/A'}
                </span>
                <span className="font-semibold text-[#102A43]">{day.category}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <AirQualityMap
        currentLocation={snapshot.location}
        cpcbAqi={snapshot.cpcbAqi}
        cpcbCategory={snapshot.cpcbCategory}
        onSelectLocation={onSelectLocation}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <Cloud className="h-4 w-4 text-[#38BDF8]" aria-hidden="true" />
          <span>Need tailored family advice for {snapshot.location.name}?</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigate('routine')}
            className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-[#102A43] hover:bg-slate-50"
          >
            View Daily Routine
          </button>
          <button
            type="button"
            onClick={() => onNavigate('assistant')}
            className="rounded-lg bg-[#102A43] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1a3f63]"
          >
            Ask AI Assistant
          </button>
        </div>
      </div>
    </div>
  );
}
