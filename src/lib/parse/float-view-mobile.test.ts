import { describe, expect, test } from 'vitest';

import withoutGps from './__fixtures__/float_view_mobile.csv?raw';
import withGps from './__fixtures__/float_view_mobile_gps.csv?raw';
import { parseFloatViewMobileCsv } from './float-view-mobile';
import { DataSource, State, Units } from './types';
import { extractGpsInformation, findPointsOfInterest, hasAdcTelemetry } from '../../components/View';

// Synthetic exports using Mobile's complete CSV header at fae17e70.
describe(parseFloatViewMobileCsv.name, () => {
  test.each([withoutGps, withGps])('maps telemetry and units from Mobile exports', async (text) => {
    const result = await parseFloatViewMobileCsv(text);
    expect(result.source).toBe(DataSource.FloatViewMobile);
    expect(result.units).toBe(Units.Metric);
    expect(result.errors).toEqual([]);
    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toMatchObject({
      index: 0,
      time: 0,
      state: State.Riding,
      speed: 25.2,
      duty: 62.5,
      distance: 1.25,
      voltage: 82.5,
      current_motor: 20,
      current_battery: 12.5,
      erpm: 4000,
      pitch: 2.5,
      true_pitch: 1.5,
      roll: -3,
      adc1: 3.2,
      adc2: 3.3,
      ah: 1.2,
      ah_charged: 0.2,
      wh: 90,
      wh_charged: 15,
      temp_mosfet: 35,
      temp_motor: 42,
      bms_temp: 30,
      bms_temp_battery: 31,
      current_booster: 2,
      current_field_weakening: 1,
      requested_amps: 21,
      setpoint: 1,
      setpoint_atr: 2,
      setpoint_break_tilt: 3,
      setpoint_torque_tilt: 4,
      setpoint_carve: 5,
      setpoint_remote: 6,
    });
    // Wall-clock time moves backwards; the monotonic elapsed clock remains usable.
    expect(result.data[1]).toMatchObject({ index: 1, time: 0.25, speed: -12, duty: -25, state: State.Wheelslip });
    expect(result.data[2]).toMatchObject({ index: 2, time: 61, speed: 0, duty: 0, state: State.Quickstop });
    expect(extractGpsInformation(result.data, result.source).gpsGaps).toEqual([
      { index: 0, secondsElapsed: 0 },
      { index: 2, secondsElapsed: 60.75 },
    ]);
  });

  test('reads optional GPS columns, including empty fixes', async () => {
    const { data } = await parseFloatViewMobileCsv(withGps);
    expect(data.map((row) => [row.gps_latitude, row.gps_longitude, row.gps_accuracy])).toEqual([
      [-34.9, 138.6, 3.5],
      [0, 0, 0],
      [-34.91, 138.61, 4],
    ]);
    const { gpsPoints } = extractGpsInformation(data, DataSource.FloatViewMobile);
    expect(gpsPoints).toEqual([
      [-34.9, 138.6],
      [-34.9, 138.6],
      [-34.91, 138.61],
    ]);
    expect(data[1]!.gps_latitude).toBe(0);
  });

  test('loads exports without GPS and leaves absent telemetry unknown', async () => {
    const { data } = await parseFloatViewMobileCsv(withoutGps);
    expect(data.every((row) => row.gps_latitude === 0 && row.gps_longitude === 0 && row.gps_accuracy === 0)).toBe(true);
    expect(data[1]!.voltage).toBeNaN();
    expect(data[1]!.adc1).toBeNaN();
    expect(hasAdcTelemetry([data[1]!])).toBe(false);
    expect(data[1]!.current_field_weakening).toBeUndefined();
    expect(data[0]!.altitude).toBeNaN();
    expect(data[0]!.state_raw).toBeNaN();
    expect(data[0]!.motor_fault).toBeNaN();
    expect(findPointsOfInterest(data).some((poi) => poi.state.startsWith('custom:'))).toBe(false);
  });

  test.each([
    ['pitch', State.StopAngle],
    ['roll', State.StopAngle],
    ['switchHalf', State.StopHalf],
    ['switchFull', State.StopFull],
    ['quickStop', State.Quickstop],
    ['reverseStop', 'reverseStop'],
    ['imuTimeout', 'imuTimeout'],
    ['futureStop', 'futureStop'],
  ])('maps stop condition %s', async (stop, expected) => {
    const { data } = await parseFloatViewMobileCsv(`elapsed_ms,ride_state,stop_condition\n0,idle,${stop}\n`);
    expect(data[0]!.state).toBe(expected);
  });

  test('preserves firmware faults and startup state', async () => {
    const { data } = await parseFloatViewMobileCsv(
      'elapsed_ms,ride_state,package_state,firmware_fault\n0,riding,running,overVoltage\n100,idle,startup,\n',
    );
    expect(data.map((row) => row.state)).toEqual(['firmware fault: overVoltage', State.Startup]);
  });

  test.each([
    'elapsed_ms,ride_state\n',
    'elapsed_ms,ride_state\n,riding\n',
    'elapsed_ms,ride_state\nNaN,riding\n',
    'elapsed_ms,ride_state\n-1,riding\n',
    'elapsed_ms,ride_state\n100,riding\n50,riding\n',
    'elapsed_ms,ride_state,speed_kph\n0,riding,Infinity\n',
    'elapsed_ms,ride_state\n0,riding,extra\n',
  ])('reports invalid exports without returning partial data', async (text) => {
    const result = await parseFloatViewMobileCsv(text);
    expect(result.data).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });
});
