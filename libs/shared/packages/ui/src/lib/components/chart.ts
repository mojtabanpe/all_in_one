import { Chart } from '@tanstack/angular-charts';
import { AioChart } from '../spartan/chart';

export { hlmChartTooltip as aioChartTooltip } from '@spartan-ng/helm/chart';
export type { ChartOptions as AioChartOptions } from '@tanstack/angular-charts';

/**
 * Spartan chart (TanStack Charts): `<tanstack-chart aioChart [options]="…" />`.
 * Build `options.definition` with `defineChart` from `@tanstack/charts`.
 */
export const AioChartImports = [Chart, AioChart] as const;
