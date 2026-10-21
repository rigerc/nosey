import {Text} from 'ink';
import {Panel, ScreenLayout, Stack, Muted} from '../components';
import {getGlobalKeys} from '../keys';
import {navScreens} from './index';
import {scanHints} from './Home';

export function HelpScreen() {
  return (
    <ScreenLayout title="Help" description="Scanning and selecting never installs skills.">
      <Stack gap={1}>
        <Panel title="Global keys" tone="muted">
          {getGlobalKeys(navScreens.length).map((hint) => (
            <Text key={hint.key}>
              {hint.key} {hint.label}
            </Text>
          ))}
          <Muted>Shortcuts pause while a text field or confirmation owns the keyboard.</Muted>
        </Panel>
        <Panel title="Scan and selection" tone="muted">
          {scanHints.map((hint) => (
            <Text key={hint.key}>
              {hint.key} {hint.label}
            </Text>
          ))}
          <Text>f or / filters by skill ID and source. c clears the applied filter.</Text>
          <Text>Hidden selections stay selected. g toggles groups; d searches skill details.</Text>
          <Text>
            Enter reviews; choose Yes then Enter to print IDs or installation commands. Nothing runs.
          </Text>
          <Text>Escape or b returns from details/groups. Ctrl+U clears active text.</Text>
        </Panel>
        <Panel title="Registries" tone="muted">
          <Text>a Add globally / i Initialize / r Reload references / Enter Details</Text>
          <Text>In details: v Validate local / u Build metadata / d Remove reference / b Back</Text>
          <Text>
            a in local details marks Always recommend skills; Space toggles, / filters, s reviews.
          </Text>
          <Text>Additions go to global config. Legacy project references can still be removed.</Text>
          <Text>
            Removing references never deletes registry files. Ctrl+X cancels initialization.
          </Text>
        </Panel>
        <Panel title="Settings" tone="muted">
          <Text>Up/down Section / Enter Edit / Escape Back / s Save / d Discard / w Wizard</Text>
          <Text>Skills CLI: opt in and choose default target agents for project-only commands.
            Drafts survive tab changes. Preview themes in Settings without saving.</Text>
          <Text>Enable check-on-start in Registries to fetch remote changes on launch.</Text>
          <Text>Registry updates can suggest npx skills update; Nosey never runs it.</Text>
          <Text>NO_COLOR always forces mono. --ascii uses ASCII borders and symbols.</Text>
        </Panel>
        <Panel title="CLI / safety" tone="muted">
          <Text>nosey [path] [--explain | --json | --skills-only | --plain]</Text>
          <Text>nosey scan [path] --depth 8 --max-files 20000</Text>
          <Text>nosey registry init|list|add|remove|show|validate|build|refresh</Text>
          <Text>nosey doctor --json / nosey --setup</Text>
          <Text>--no-interactive produces a plain report. Piped output never prompts.</Text>
          <Text>
            Scan targets are read-only. Installed indicators use project-local files and lock metadata.
            Partial results show limits, skipped files, or registry
            warnings.
          </Text>
        </Panel>
      </Stack>
    </ScreenLayout>
  );
}
