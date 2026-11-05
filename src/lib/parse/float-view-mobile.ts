import csv from 'papaparse';

import type { ParseResult } from './index';
import { cleanCsvHeader } from './csv-format';
import { ParseError } from './errors';
import { DataSource, State, Units, type RowWithIndex } from './types';

type MobileRow = Record<string, string>;

const stopStates: Record<string, string> = {
  pitch: State.StopAngle,
  roll: State.StopAngle,
  switchHalf: State.StopHalf,
  switchFull: State.StopFull,
  quickStop: State.Quickstop,
};

function state(row: MobileRow): string {
  if (row.firmware_fault && row.firmware_fault !== 'none') return `firmware fault: ${row.firmware_fault}`;
  if (row.wheelslip === '1') return State.Wheelslip;
  if (row.ride_state === 'riding') return State.Riding;
  if (row.package_state === 'startup') return State.Startup;
  if (row.stop_condition && row.stop_condition !== 'none') {
    return Object.hasOwn(stopStates, row.stop_condition) ? stopStates[row.stop_condition]! : row.stop_condition;
  }
  return row.ride_state || 'unknown';
}

function optionalNumber(row: MobileRow, key: string): number | undefined {
  const value = row[key]?.trim();
  if (!value) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid Float View Mobile number in ${key}: ${value}`);
  return number;
}

function mapRow(row: MobileRow, index: number, startTime: number): RowWithIndex {
  // Missing telemetry is unknown, rather than a measured zero. GPS uses the
  // existing (0, 0) convention for a missing fix; optional series stay undefined.
  const number = (key: string): number => optionalNumber(row, key) ?? NaN;
  const elapsed = number('elapsed_ms');
  if (!Number.isFinite(elapsed) || elapsed < startTime) throw new Error('Invalid Float View Mobile elapsed time');

  return {
    index,
    time: (elapsed - startTime) / 1000,
    state: state(row),
    // Mobile exports semantic strings, not the numeric codes used by other apps.
    state_raw: NaN,
    motor_fault: NaN,
    adc1: number('footpadAdc1V'),
    adc2: number('footpadAdc2V'),
    ah: number('ampHoursDrawnAh'),
    ah_charged: optionalNumber(row, 'ampHoursChargedAh'),
    wh: number('wattHoursDrawnWh'),
    wh_charged: optionalNumber(row, 'wattHoursChargedWh'),
    altitude: NaN,
    current_battery: number('battery_current_a'),
    current_motor: number('motor_current_a'),
    current_booster: optionalNumber(row, 'boosterCurrentA'),
    current_field_weakening: optionalNumber(row, 'fieldWeakeningCurrentA'),
    requested_amps: optionalNumber(row, 'requestedBalanceCurrentA'),
    distance: number('distanceM') / 1000,
    duty: number('duty_cycle') * 100,
    erpm: optionalNumber(row, 'erpm'),
    gps_accuracy: optionalNumber(row, 'gpsAccuracy') ?? 0,
    gps_latitude: optionalNumber(row, 'gpsLatitude') ?? 0,
    gps_longitude: optionalNumber(row, 'gpsLongitude') ?? 0,
    pitch: number('balancePitchDeg'),
    true_pitch: number('pitchDeg'),
    roll: number('rollDeg'),
    speed: number('speed_kph'),
    voltage: number('pack_voltage_v'),
    temp_mosfet: number('controller_temp_c'),
    temp_motor: number('motor_temp_c'),
    bms_temp: optionalNumber(row, 'bms_circuitry_temp_c'),
    bms_temp_battery: optionalNumber(row, 'bms_highest_cell_temp_c'),
    setpoint: optionalNumber(row, 'setpointDeg'),
    setpoint_atr: optionalNumber(row, 'atrSetpointDeg'),
    setpoint_break_tilt: optionalNumber(row, 'brakeTiltSetpointDeg'),
    setpoint_torque_tilt: optionalNumber(row, 'torqueTiltSetpointDeg'),
    setpoint_carve: optionalNumber(row, 'turnTiltSetpointDeg'),
    setpoint_remote: optionalNumber(row, 'remoteSetpointDeg'),
  };
}

/** CSV schema: Float View Mobile product-store/src/csv.rs (fae17e70). */
export async function parseFloatViewMobileCsv(input: string | File): Promise<ParseResult> {
  const result: ParseResult = { source: DataSource.FloatViewMobile, data: [], units: Units.Metric, errors: [] };
  try {
    const text = typeof input === 'string' ? input : await input.text();
    const parsed = csv.parse<MobileRow>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: cleanCsvHeader,
    });
    if (parsed.errors.length) throw new ParseError('Malformed Float View Mobile CSV', parsed.errors);
    if (!parsed.data.length) throw new Error('Float View Mobile CSV contained no rows');
    const start = optionalNumber(parsed.data[0]!, 'elapsed_ms');
    if (start === undefined || start < 0) throw new Error('Invalid Float View Mobile elapsed time');
    const rows = parsed.data.map((row, index) => mapRow(row, index, start));
    if (rows.some((row, index) => index > 0 && row.time < rows[index - 1]!.time)) {
      throw new Error('Float View Mobile elapsed time must not decrease');
    }
    result.data = rows;
  } catch (error) {
    result.errors.push(new ParseError('Failed to parse Float View Mobile CSV!', error));
  }
  return result;
}
