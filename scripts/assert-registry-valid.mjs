#!/usr/bin/env node
// Dependency-free assertion for `nosey registry validate --json` output.
// Keeps the CLI contract unchanged while turning a print-only CI step into a check.
import process from 'node:process';

async function readStdin() {
  let input = '';

  for await (const chunk of process.stdin) input += chunk;

  return input;
}

async function main() {
  const input = await readStdin();
  let report;

  try {
    report = JSON.parse(input);
  } catch {
    throw new Error('registry validate did not emit JSON');
  }

  if (report?.valid !== true) {
    const errors = Array.isArray(report?.errors)
      ? report.errors.join('; ')
      : 'no error list reported';

    throw new Error('registry is invalid: ' + errors);
  }

  if (!Array.isArray(report.errors) || report.errors.length > 0) {
    throw new Error('registry validate reported success with errors present');
  }

  console.log('Registry is valid.');
}

try {
  await main();
} catch (error) {
  console.error('nosey: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
