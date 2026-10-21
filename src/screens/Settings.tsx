import {Box, Text} from 'ink';
import {useEffect, useState} from 'react';
import {Badge, Confirm, Panel, ScreenLayout, Stack, StatusMessage} from '../components';
import {useScreenHints} from '../features/ui/context';
import {formatValue} from '../lib/format';
import {ConfigSectionEditor, ConfigWizard} from '../components/config';
import {appConfig, configSections, resolveConfig} from '../config';
import {useConfigRuntime} from '../config/context';
import {useKeymap} from '../hooks';
import {useConfigDraft} from '../hooks/useConfigDraft';
import {useToast} from '../hooks/useToast';
import {toAppError} from '../lib/errors';
import {useTheme} from '../theme/context';

function SettingsEditor({
  onWizard,
  onChanged,
}: {
  onWizard: () => void;
  onChanged: (changed: boolean) => void;
}) {
  const {path, flags} = useConfigRuntime();
  const draft = useConfigDraft(path);
  const theme = useTheme();
  const toast = useToast();
  const sections = configSections(appConfig.fields);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirmWizard, setConfirmWizard] = useState(false);
  useEffect(() => onChanged(draft.changed), [draft.changed, onChanged]);
  const section = sections[sectionIndex] ?? 'Appearance';
  const resolved = resolveConfig(appConfig.fields, draft.draft, {flags});
  const sources = resolved.sources;
  useScreenHints(
    'settings',
    confirmWizard
      ? [
          {key: 'y/n', label: 'choose'},
          {key: 'enter', label: 'confirm'},
          {key: 'esc', label: 'cancel'},
        ]
      : editing
        ? [
            {key: 'esc', label: 'back'},
            {key: 'enter', label: 'edit/select'},
          ]
        : [
            {key: 'up/down', label: 'section'},
            {key: 'enter', label: 'edit'},
            {key: 's', label: 'save'},
            {key: 'd', label: 'discard'},
            {key: 'w', label: 'wizard'},
          ],
  );

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
      {key: 'w', run: () => (draft.changed ? setConfirmWizard(true) : onWizard())},
    ],
    {isActive: !editing && !confirmWizard, scope: 'screen'},
  );

  return (
    <Stack gap={1}>
      <Panel title="Configuration">
        <Text wrap="truncate-end">{draft.path}</Text>
        <Text>{draft.changed ? 'Unsaved changes' : 'No pending changes'}</Text>
        {appConfig.fields.map((field) => (
          <Text key={field.path}>
            {field.label}:{' '}
            {formatValue(resolved.values[field.path as keyof typeof resolved.values])} [
            {sources[field.path]}]
          </Text>
        ))}
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
      {confirmWizard && (
        <Confirm
          message="Discard this draft and open guided setup?"
          onConfirm={(yes) => {
            setConfirmWizard(false);
            if (yes) onWizard();
          }}
        />
      )}
      {editing && !draft.error && (
        <Panel title={section}>
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
          <Text dimColor>Drafts are preserved when you switch tabs.</Text>
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
  const [dirty, setDirty] = useState(false);
  return (
    <ScreenLayout
      title="Settings"
      description="Review and configure application preferences"
      actions={dirty ? <Badge tone="warn">UNSAVED</Badge> : undefined}
    >
      {wizard ? (
        <Panel title="Guided configuration">
          <ConfigWizard
            path={path}
            onFinish={() => {
              setWizard(false);
              setDirty(false);
              setRevision((value) => value + 1);
            }}
          />
        </Panel>
      ) : (
        <SettingsEditor key={revision} onChanged={setDirty} onWizard={() => setWizard(true)} />
      )}
    </ScreenLayout>
  );
}
