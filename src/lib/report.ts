import type {Report} from './detect.js';
import type {SkippedFile} from './scanner.js';

export function formatSkippedFile(item: SkippedFile): string {
  if (item.reason === 'too-large') {
    return `${item.file}: ${item.reason} (${item.sizeBytes} bytes; limit ${item.limitBytes})`;
  }

  return `${item.file}: ${item.reason}`;
}

/** Plain-text report used for non-interactive terminals and pipes. */
export function formatReport(report: Report, explain = false, ascii = false): string {
  const bullet = ascii ? '-' : '•';
  const arrow = ascii ? '->' : '↳';
  const dash = ascii ? '-' : '—';

  const lines = [
    `Project: ${report.project}`,
    `Scanned: ${report.scannedFiles} files${
      report.truncated ? ' (limit reached; detection may be incomplete)' : ''
    }`,
  ];

  if (report.skippedFiles.length > 0) {
    lines.push(`Skipped files ${dash} detection may be incomplete:`);

    for (const item of report.skippedFiles) lines.push(`  ${formatSkippedFile(item)}`);
  }

  lines.push('', `Technologies (${report.technologies.length})`);

  if (report.technologies.length === 0) lines.push('  None found');

  for (const tech of report.technologies) {
    lines.push(`  ${bullet} ${tech.name}${tech.skills.length === 0 ? '  [no mapped skills]' : ''}`);

    if (explain) {
      for (const evidence of tech.evidence) lines.push(`      ${arrow} ${evidence}`);
    }
  }

  if (report.combinations.length > 0) {
    lines.push('', `Matching combinations (${report.combinations.length})`);

    for (const combo of report.combinations) {
      lines.push(
        `  ${bullet} ${combo.name}${combo.skills.length === 0 ? '  [no mapped skills]' : ''}`,
      );
    }
  }

  if (report.mcpServers?.length) {
    lines.push('', `MCP servers (${report.mcpServers.length}; configuration only)`);

    for (const server of report.mcpServers) {
      lines.push(
        `  ${bullet} ${server.name} [${server.status}, ${server.transport}] (${server.file})`,
      );

      if (explain && server.package)
        lines.push(`      ${arrow} ${server.package.ecosystem}: ${server.package.name}`);
    }
  }

  if (report.agents.length > 0) {
    lines.push('', 'Detected agent folders');

    for (const agent of report.agents) {
      lines.push(`  ${bullet} ${agent.folder} (${agent.agent})`);
    }
  }

  lines.push('', `Suggested skills (${report.skills.length})`);

  if (report.skills.length === 0) {
    lines.push('  No mapped skills for the detected technologies.');
  }

  for (const skill of report.skills) {
    lines.push(`  ${bullet} ${skill.id}`);

    if (explain) {
      lines.push(`      ${arrow} ${skill.sources.map((source) => source.name).join(', ')}`);
    }
  }

  if (report.registryWarnings?.length) {
    lines.push('', 'Registry warnings');

    for (const warning of report.registryWarnings)
      lines.push('  ' + bullet + ' ' + warning.source + ': ' + warning.message);
  }

  lines.push('', `Suggestions only ${dash} no skills were installed.`);

  return lines.join('\n');
}
