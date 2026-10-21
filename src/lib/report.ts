import type {Report} from './detect.js';
import type {SkippedFile} from './scanner.js';

export function formatSkippedFile(item: SkippedFile): string {
	if (item.reason === 'too-large') {
		return `${item.file}: ${item.reason} (${item.sizeBytes} bytes; limit ${item.limitBytes})`;
	}

	return `${item.file}: ${item.reason}`;
}

/** Plain-text report used for non-interactive terminals and pipes. */
export function formatReport(report: Report, explain = false): string {
	const lines = [
		`Project: ${report.project}`,
		`Scanned: ${report.scannedFiles} files${
			report.truncated ? ' (limit reached; detection may be incomplete)' : ''
		}`,
	];
	if (report.skippedFiles.length > 0) {
		lines.push('Skipped files — detection may be incomplete:');
		for (const item of report.skippedFiles)
			lines.push(`  ${formatSkippedFile(item)}`);
	}

	lines.push('', `Technologies (${report.technologies.length})`);

	if (report.technologies.length === 0) lines.push('  None found');
	for (const tech of report.technologies) {
		lines.push(
			`  • ${tech.name}${
				tech.skills.length === 0 ? '  [no mapped skills]' : ''
			}`,
		);
		if (explain) {
			for (const evidence of tech.evidence) lines.push(`      ↳ ${evidence}`);
		}
	}

	if (report.combinations.length > 0) {
		lines.push('', `Matching combinations (${report.combinations.length})`);
		for (const combo of report.combinations) {
			lines.push(
				`  • ${combo.name}${
					combo.skills.length === 0 ? '  [no mapped skills]' : ''
				}`,
			);
		}
	}

	if (report.agents.length > 0) {
		lines.push('', 'Detected agent folders');
		for (const agent of report.agents) {
			lines.push(`  • ${agent.folder} (${agent.agent})`);
		}
	}

	lines.push('', `Suggested skills (${report.skills.length})`);
	if (report.skills.length === 0) {
		lines.push('  No mapped skills for the detected technologies.');
	}

	for (const skill of report.skills) {
		lines.push(`  • ${skill.id}`);
		if (explain) {
			lines.push(
				`      ↳ ${skill.sources.map(source => source.name).join(', ')}`,
			);
		}
	}

	if (report.registryWarnings?.length) {
		lines.push('', 'Registry warnings');
		for (const warning of report.registryWarnings)
			lines.push('  • ' + warning.source + ': ' + warning.message);
	}

	lines.push('', 'Suggestions only — no skills were installed.');
	return lines.join('\n');
}
