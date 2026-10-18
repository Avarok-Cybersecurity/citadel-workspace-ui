/**
 * What a conversion to or from another format could not carry: cdoc-model's Report, read from
 * the engine's JSON. Every importer and exporter returns one and the UI shows every entry; a
 * report this side cannot read is an error, never an empty report.
 *
 * A loss is either counted (`{part, what, count}`) or refused macros (`{part, bytes}`), told
 * apart by their fields exactly as citadel-docs serialises cdoc_model::Loss (untagged).
 */
import type { ConversionLoss, ConversionReport } from './editor/file-formats';

/** The report of a document that was not converted: opened blank, or from Docs' own JSON. */
export const NOT_CONVERTED: ConversionReport = { losses: [], problems: [] };

export class ConversionReportError extends Error {
  constructor(message: string) {
    super(`unreadable conversion report: ${message}`);
    this.name = 'ConversionReportError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function lossOf(value: unknown, index: number): ConversionLoss {
  if (!isRecord(value) || typeof value.part !== 'string') throw new ConversionReportError(`loss ${index} has no part`);
  if (typeof value.what === 'string' && typeof value.count === 'number' && Number.isInteger(value.count)) {
    return { kind: 'counted', part: value.part, what: value.what, count: value.count };
  }
  if (typeof value.bytes === 'number' && Number.isInteger(value.bytes) && value.bytes >= 0) {
    return { kind: 'macros', part: value.part, bytes: BigInt(value.bytes) };
  }
  throw new ConversionReportError(`loss ${index} is neither counted nor refused macros`);
}

/** `report` is the engine's `{losses: [...]}`; `problems` its array of strings. */
export function readConversionReport(report: unknown, problems: unknown): ConversionReport {
  if (!isRecord(report) || !Array.isArray(report.losses)) throw new ConversionReportError('no losses array');
  if (!Array.isArray(problems) || !problems.every((p: unknown): p is string => typeof p === 'string')) {
    throw new ConversionReportError('problems is not an array of strings');
  }
  return { losses: report.losses.map(lossOf), problems };
}
