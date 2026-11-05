import { describe, expect, test } from 'vitest';
import { strToU8, zipSync } from 'fflate';

import fcMetricCsv from './__fixtures__/fc_metric.csv?raw';
import floatyCsv from './__fixtures__/floaty.csv?raw';
import vescMetricCsv from './__fixtures__/vesc_metric.csv?raw';
import mobileCsv from './__fixtures__/float_view_mobile.csv?raw';
import mobileGpsCsv from './__fixtures__/float_view_mobile_gps.csv?raw';
import { parse } from './index';

class MockFile extends File {
  constructor(
    private fileParts: BlobPart[],
    fileName: string,
    options?: FilePropertyBag,
  ) {
    super(fileParts, fileName, options);
  }

  async text() {
    return this.fileParts.map((part) => part.toString()).join('');
  }
}

class MockZipFile extends File {
  constructor(
    private bytes: Uint8Array,
    name = 'ride.csv.zip',
    type = 'application/zip',
  ) {
    super([Uint8Array.from(bytes).buffer], name, { type });
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return Uint8Array.from(this.bytes).buffer;
  }
}

const zipFile = (files: Record<string, string>, name?: string, type?: string) =>
  new MockZipFile(
    zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, Uint8Array.from(strToU8(text))]))),
    name,
    type,
  );

describe(parse.name, () => {
  test.each([
    ['Mobile without GPS', mobileCsv],
    ['Mobile with GPS', mobileGpsCsv],
    ['Float Control', fcMetricCsv],
    ['Floaty', floatyCsv],
    ['VESC Tool', vescMetricCsv],
  ])('imports zipped %s identically to plain CSV', async (_, text) => {
    const plain = await parse(new MockFile([text], 'ride.csv', { type: 'text/csv' }));
    const zipped = await parse(zipFile({ 'ride.csv': text }));
    expect(zipped.errors).toEqual([]);
    expect(zipped).toEqual(plain);
  });

  test('ignores directories and macOS metadata in a Finder-created ZIP', async () => {
    const result = await parse(
      zipFile({
        'rides/': '',
        'rides/ride.CSV': mobileGpsCsv,
        '__MACOSX/._ride.csv': 'metadata',
        'rides/.DS_Store': 'metadata',
        'rides/._ride.CSV': 'metadata',
      }),
    );
    expect(result.source).toBe('float_view_mobile');
    expect(result.errors).toEqual([]);
    expect(result.data).toHaveLength(3);
  });

  test.each([
    ['ride.CSV.ZIP', ''],
    ['download', 'application/zip'],
    ['download', 'application/x-zip-compressed'],
  ])('recognises ZIP filename or MIME type: %s %s', async (name, type) => {
    const result = await parse(zipFile({ 'ride.csv': mobileCsv }, name, type));
    expect(result.source).toBe('float_view_mobile');
    expect(result.errors).toEqual([]);
  });

  test.each<Record<string, string>>([
    {},
    { '__MACOSX/._ride.csv': 'metadata' },
    { 'ride.csv': mobileCsv, 'other.csv': mobileCsv },
    { 'ride.txt': mobileCsv },
    { 'ride.csv': mobileCsv, 'notes.txt': 'extra file' },
  ])('rejects ZIPs that do not contain a single CSV export', async (files) => {
    const result = await parse(zipFile(files));
    expect(result.source).toBe('none');
    expect(result.data).toEqual([]);
    expect(result.errors[0]!.message).toMatch(/single CSV/);
  });

  test('reports corrupt ZIPs as parse errors', async () => {
    const result = await parse(new MockZipFile(strToU8('not a zip')));
    expect(result.source).toBe('none');
    expect(result.data).toEqual([]);
    expect(result.errors[0]!.message).toMatch(/Failed to read ZIP/);
  });

  test('rejects unrecognised CSV headers inside ZIPs', async () => {
    const result = await parse(zipFile({ 'ride.csv': 'foo,bar\n1,2\n' }));
    expect(result.source).toBe('none');
    expect(result.data).toEqual([]);
    expect(result.errors[0]!.message).toMatch(/Unrecognised CSV headers/);
  });

  test.each([mobileCsv, mobileGpsCsv])('routes Mobile CSV exports with or without GPS', async (text) => {
    const result = await parse(new MockFile([text], 'mobile.csv', { type: 'text/csv' }));
    expect(result.source).toBe('float_view_mobile');
    expect(result.errors).toEqual([]);
    expect(result.data).toHaveLength(3);
  });

  test('detects Mobile headers with BOM, quotes, whitespace, and no MIME type', async () => {
    const text = '\uFEFF"sequence"," elapsed_ms ","ride_state","pack_voltage_v","duty_cycle"\r\n1,0,riding,80,0.5\r\n';
    const result = await parse(new MockFile([text], 'mobile.CSV'));
    expect(result.source).toBe('float_view_mobile');
    expect(result.errors).toEqual([]);
    expect(result.data[0]).toMatchObject({ time: 0, voltage: 80, duty: 50 });
  });

  test('does not mistake shared Mobile headers for another supported format', async () => {
    const result = await parse(new MockFile(['erpm,duty_cycle\n1000,0.5\n'], 'other.csv'));
    expect(result.source).toBe('none');
    expect(result.errors).toHaveLength(1);
  });

  test('routes semicolon-delimited CSV to VESC Tool parser', async () => {
    const result = await parse(new MockFile([vescMetricCsv], 'vesc.csv', { type: 'text/csv' }));
    expect(result.source).toBe('vesc_tool');
  });

  test('routes comma-delimited CSV to Float Control parser', async () => {
    const result = await parse(new MockFile([fcMetricCsv], 'fc.csv', { type: 'text/csv' }));
    expect(result.source).toBe('float_control');
  });

  test('routes Floaty CSV to Floaty parser', async () => {
    const result = await parse(new MockFile([floatyCsv], 'floaty.csv', { type: 'text/csv' }));
    expect(result.source).toBe('floaty');
    expect(result.errors).toEqual([]);
    expect(result.data).toHaveLength(3);
  });

  test('routes normalized Float Control headers to the Float Control parser', async () => {
    const normalizedCsv = 'time,state,distance,speed,duty\n0,riding,0,1,2\n';
    const result = await parse(new MockFile([normalizedCsv], 'normalized.csv', { type: 'text/csv' }));
    expect(result.source).toBe('float_control');
    expect(result.data).toHaveLength(1);
  });

  test('handles quoted Floaty headers with a byte-order mark', async () => {
    const quotedFloatyCsv = `\uFEFF"timestamp","speed","dutyCycle","batteryVolts","tripDistance"\n1000,1,0.1,80,1\n`;
    const result = await parse(new MockFile([quotedFloatyCsv], 'quoted-floaty.csv', { type: 'text/csv' }));
    expect(result.source).toBe('floaty');
    expect(result.errors).toEqual([]);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ time: 0, speed: 1, duty: 10, voltage: 80, distance: 1 });
  });

  test('does not classify a CSV from one coincidentally matching header', async () => {
    const result = await parse(new MockFile(['State,foo\nriding,1\n'], 'coincidental.csv', { type: 'text/csv' }));
    expect(result.source).toBe('none');
    expect(result.data).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  test('rejects unrecognised semicolon-delimited CSV headers', async () => {
    const result = await parse(new MockFile(['foo;bar\n1;2\n'], 'unknown.csv', { type: 'text/csv' }));
    expect(result.source).toBe('none');
    expect(result.data).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  test('rejects headers that ambiguously match multiple formats', async () => {
    const ambiguousCsv =
      'timestamp,dutyCycle,batteryVolts,tripDistance,ms_today,input_voltage,duty_cycle\n1,0.1,80,1,1,80,0.1\n';
    const result = await parse(new MockFile([ambiguousCsv], 'ambiguous.csv', { type: 'text/csv' }));
    expect(result.source).toBe('none');
    expect(result.data).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  test('rejects unrecognised CSV headers with a parse error', async () => {
    const result = await parse(new MockFile(['foo,bar\n1,2\n'], 'unknown.csv', { type: 'text/csv' }));
    expect(result.source).toBe('none');
    expect(result.data).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(/Unrecognised CSV headers/);
  });
});
