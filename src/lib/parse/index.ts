import * as fflate from 'fflate';

import { parseFloatControlCsv } from './float-control';
import { parseFloatyCsv, parseFloatyJson } from './floaty';
import { parseVescToolCsv } from './vesc-tool';
import { parseFloatViewMobileCsv } from './float-view-mobile';
import { DataSource, Units, type RowWithIndex } from './types';
import { ParseError } from './errors';
import { CsvFormat, detectCsvFormat } from './csv-format';

export interface ParseResult {
  data: RowWithIndex[];
  units: Units;
  source: DataSource;
  errors: Error[];
}

export enum SupportedMimeTypes {
  /** Supported CSV ride exports */
  Csv = 'text/csv',
  /** Zipped CSV ride exports */
  Zip1 = 'application/zip',
  Zip2 = 'application/x-zip-compressed',
  /** Floaty's JSON */
  Json = 'application/json',
}

export const supportedMimeTypes = Object.values<string>(SupportedMimeTypes);
export const supportedMimeTypeString = supportedMimeTypes.join(',');

export async function parse(file: File): Promise<ParseResult> {
  const lowerName = file.name.toLowerCase();
  if (file.type === SupportedMimeTypes.Zip1 || file.type === SupportedMimeTypes.Zip2 || lowerName.endsWith('.zip')) {
    try {
      const fileMap = fflate.unzipSync(new Uint8Array(await file.arrayBuffer()), {
        filter: ({ name }) => {
          const parts = name.split('/');
          const basename = parts.at(-1)!;
          return (
            basename !== '' && !parts.includes('__MACOSX') && basename !== '.DS_Store' && !basename.startsWith('._')
          );
        },
      });
      const fileList = Object.keys(fileMap);
      if (fileList.length !== 1 || !fileList[0]!.toLowerCase().endsWith('.csv')) {
        return {
          source: DataSource.None,
          data: [],
          units: Units.Metric,
          errors: [new ParseError('Expected a zip containing a single CSV ride export!', file)],
        };
      }
      return await parseCsv(new TextDecoder().decode(fileMap[fileList[0]!]!));
    } catch (error) {
      return {
        source: DataSource.None,
        data: [],
        units: Units.Metric,
        errors: [new ParseError('Failed to read ZIP ride export!', error)],
      };
    }
  }

  if (file.type === SupportedMimeTypes.Csv || lowerName.endsWith('.csv')) {
    return await parseCsv(await file.text());
  }

  if (file.type === SupportedMimeTypes.Json || lowerName.endsWith('.json')) {
    return await parseFloatyJson(file);
  }

  return {
    source: DataSource.None,
    data: [],
    units: Units.Metric,
    errors: [new ParseError('Unrecognised file!', file)],
  };
}

async function parseCsv(text: string): Promise<ParseResult> {
  switch (detectCsvFormat(text)) {
    case CsvFormat.Floaty:
      return await parseFloatyCsv(text);
    case CsvFormat.FloatControl: {
      const parsed = await parseFloatControlCsv(text);
      return {
        source: DataSource.FloatControl,
        data: parsed.csv.data,
        units: parsed.units,
        errors: parsed.errors,
      };
    }
    case CsvFormat.VescTool:
      return await parseVescToolCsv(text);
    case CsvFormat.FloatViewMobile:
      return await parseFloatViewMobileCsv(text);
  }

  return {
    source: DataSource.None,
    data: [],
    units: Units.Metric,
    errors: [
      new ParseError(
        'Unrecognised CSV headers. Expected a Float Control, Floaty, VESC Tool, or Float View Mobile export.',
        {
          header: text.split(/\r?\n/, 1)[0] ?? '',
        },
      ),
    ],
  };
}
