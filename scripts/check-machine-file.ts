#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

import {
  MAX_MACHINE_SOURCE_BYTES_V1,
  openMachineDocument,
  rejectOversizedMachineDocument,
  rejectUnreadableMachineDocument,
  type MachineDocument,
} from '../apps/studio/src/engine.ts';
import {
  MACHINE_CHECK_RECEIPT_KIND_V1,
  MACHINE_CHECK_RECEIPT_SCHEMA_VERSION_V1,
  createMachineCheckReceipt,
  formatMachineCheckReceipt,
} from '../apps/studio/src/machineCheckContract.ts';

const USAGE = 'Usage: pnpm machine:check -- <file.k|file.kc> [--json]';

interface ParsedArguments {
  readonly filePath: string | null;
  readonly json: boolean;
  readonly help: boolean;
  readonly error: string | null;
}

function parseArguments(args: readonly string[]): ParsedArguments {
  let json = false;
  let help = false;
  const positionals: string[] = [];
  for (const argument of args) {
    if (argument === '--') {
      continue;
    } else if (argument === '--json') {
      json = true;
    } else if (argument === '--help' || argument === '-h') {
      help = true;
    } else if (argument.startsWith('-')) {
      return {
        filePath: null,
        json,
        help,
        error: `Unsupported option: ${argument}`,
      };
    } else {
      positionals.push(argument);
    }
  }
  if (positionals.length > 1) {
    return {
      filePath: null,
      json,
      help,
      error: 'Expected exactly one machine file.',
    };
  }
  return {
    filePath: positionals[0] ?? null,
    json,
    help,
    error: null,
  };
}

function writeUsageError(message: string, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({
      kind: MACHINE_CHECK_RECEIPT_KIND_V1,
      schemaVersion: MACHINE_CHECK_RECEIPT_SCHEMA_VERSION_V1,
      error: {
        kind: 'usage',
        message,
      },
      usage: USAGE,
    }, null, 2)}\n`);
  } else {
    process.stderr.write(`${message}\n${USAGE}\n`);
  }
}

function writeDocument(
  document: MachineDocument,
  options: {
    readonly byteCount: number | null;
    readonly sha256: string | null;
    readonly json: boolean;
  },
): void {
  const receipt = createMachineCheckReceipt(document, options);
  process.stdout.write(options.json
    ? `${JSON.stringify(receipt, null, 2)}\n`
    : formatMachineCheckReceipt(receipt));
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (args.error !== null) {
    writeUsageError(args.error, args.json);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (args.filePath === null) {
    writeUsageError('A .k or .kc file path is required.', args.json);
    process.exitCode = 2;
    return;
  }

  const extension = extname(args.filePath).toLowerCase();
  if (extension !== '.k' && extension !== '.kc') {
    writeUsageError('Only .k and .kc files are supported.', args.json);
    process.exitCode = 2;
    return;
  }

  const absolutePath = resolve(args.filePath);
  const filename = basename(absolutePath);
  let fileStats: Awaited<ReturnType<typeof stat>>;
  try {
    fileStats = await stat(absolutePath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    writeDocument(rejectUnreadableMachineDocument(filename, reason), {
      byteCount: null,
      sha256: null,
      json: args.json,
    });
    process.exitCode = 2;
    return;
  }

  if (!fileStats.isFile()) {
    writeDocument(rejectUnreadableMachineDocument(filename, 'Path is not a regular file.'), {
      byteCount: fileStats.size,
      sha256: null,
      json: args.json,
    });
    process.exitCode = 2;
    return;
  }

  if (fileStats.size > MAX_MACHINE_SOURCE_BYTES_V1) {
    writeDocument(rejectOversizedMachineDocument(filename, fileStats.size), {
      byteCount: fileStats.size,
      sha256: null,
      json: args.json,
    });
    process.exitCode = 1;
    return;
  }

  let bytes: Uint8Array;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    writeDocument(rejectUnreadableMachineDocument(filename, reason), {
      byteCount: fileStats.size,
      sha256: null,
      json: args.json,
    });
    process.exitCode = 2;
    return;
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const document = extension === '.kc'
    ? openMachineDocument(filename, bytes, { dialect: 'knitout-vendor' })
    : openMachineDocument(filename, bytes, {});

  writeDocument(document, {
    byteCount: bytes.byteLength,
    sha256,
    json: args.json,
  });
  process.exitCode = document.verdict.state === 'surface' ? 0 : 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  writeUsageError(`Internal checker failure: ${message}`, process.argv.includes('--json'));
  process.exitCode = 2;
});
