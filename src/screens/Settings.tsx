import {Box, Text} from 'ink';
import {useState} from 'react';
import {Panel, Stack, StatusMessage} from '../components';
import {ConfigSectionEditor, ConfigWizard} from '../components/config';
import {appConfig, configSections, resolveConfig} from '../config';
import {useConfigRuntime} from '../config/context';
import {useKeymap} from '../hooks';
import {useConfigDraft} from '../hooks/useConfigDraft';
import {useToast} from '../hooks/useToast';
import {toAppError} from '../lib/errors';
import {useTheme} from '../theme/context';

function SettingsEditor({onWizard}: {onWizard: () => void}) {
  const {path, flags} = useConfigRuntime();
  const draft = useConfigDraft(path);
  const theme = useTheme();
  const toast = useToast();
  const sections = configSections(appConfig.fields);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const section = sections[sectionIndex] ?? 'Appearance';
  const sources = resolveConfig(appConfig.fields, draft.draft, {flags}).sources;

  const save = () => {
    try {
      draft.save();
      toast.push('Configuration saved. Relaunch to apply settings.', 'success');
    } catch (error) {
      toast.push(`Could not save: ${toAppError(error).message}`, 'warn');
    }
  };
  useKeymap(
    [
      {key: 'up', run: () => setSectionIndex((i) => Math.max(i - 1, 0))},
      {key: 'down', run: () => setSectionIndex((i) => Math.min(i + 1, sections.length - 1))},
      {key: 'enter', run: () => setEditing(true)},
      {key: 's', run: save},
      {key: 'd', run: draft.discard},
      {key: 'w', run: onWizard},
    ],
    {isActive: !editing},
  );

  return (
    <Stack gap={1}>
      <Panel title="Configuration" footer="↑/↓ section  enter edit  s save  d discard  w wizard">
        <Text wrap="truncate-end">{draft.path}</Text>
        <Text>{draft.changed ? 'Unsaved changes' : 'No pending changes'}</Text>
        {sections.map((name, index) => (
          <Text
            key={name}
            bold={index === sectionIndex}
            color={index === sectionIndex ? theme.color.primary : theme.color.text}
          >
            {index === sectionIndex ? theme.symbols.pointer : ' '} {name}
          </Text>
        ))}
      </Panel>
      {draft.error && <StatusMessage tone="danger">{draft.error}</StatusMessage>}
      {editing && !draft.error && (
        <Panel title={section} footer="esc returns to sections / changes are drafts">
          <ConfigSectionEditor
            key={section}
            fields={appConfig.fields.filter((field) => field.section === section)}
            values={draft.draft}
            onChange={draft.update}
            onBack={() => setEditing(false)}
            sources={sources}
          />
        </Panel>
      )}
      {!editing && (
        <Box flexDirection="column">
          <Text dimColor>Save commits all changes. Discard restores the loaded file.</Text>
          <Text dimColor>Environment variables and CLI flags override saved settings.</Text>
        </Box>
      )}
    </Stack>
  );
}

/** The guided setup flow is available inside the main application's Settings tab. */
export function SettingsScreen() {
  const {path} = useConfigRuntime();
  const [wizard, setWizard] = useState(false);
  const [revision, setRevision] = useState(0);
  if (wizard)
    return (
      <Panel title="Guided configuration">
        <ConfigWizard
          path={path}
          onFinish={() => {
            setWizard(false);
            setRevision((value) => value + 1);
          }}
        />
      </Panel>
    );
  return <SettingsEditor key={revision} onWizard={() => setWizard(true)} />;
}
