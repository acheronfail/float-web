import { expect, test } from 'vitest';
import { render } from '@testing-library/svelte';
import Footpads from './Footpads.svelte';
import { empty } from '../lib/parse/types';

test('shows missing ADC readings as unknown while retaining measured readings', () => {
  const screen = render(Footpads, {
    data: { ...empty, speed: 20, adc1: NaN, adc2: 3.2 },
    hasAdcTelemetry: true,
  });
  expect(screen.getByText('unknown')).toBeInTheDocument();
  expect(screen.getByText('3.20')).toBeInTheDocument();
  expect(screen.container.querySelectorAll('path')[1]).toHaveAttribute('fill', '#475569');
  expect(screen.container.querySelectorAll('path')[2]).toHaveAttribute('fill', '#0ea5e9');
});
