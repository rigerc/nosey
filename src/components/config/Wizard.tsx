import {Box, Text} from 'ink';
import {useState} from 'react';
import {appConfig, configSections, getAtPath} from '../../config';
import {useConfigDraft} from '../../hooks/useConfigDraft';
import {useInputCapture} from '../../hooks/useInputCapture';
import {useKeymap} from '../../hooks/useKeymap';
import {formatValue} from '../../lib/format';
import {Confirm} from '../Confirm';
import {KeyValue} from '../KeyValue';
import {StatusMessage} from '../Status';
import {Step, Stepper, type StepContext} from '../Stepper';
import {Muted} from '../typography';
import {ConfigSectionEditor} from './Editor';

export type ConfigWizardResult = 'saved' | 'cancelled';

function Review({
  draft,
  path,
  changed,
  onConfirm,
  onBack,
}: {
  draft: object;
  path: string;
  changed: boolean;
  onConfirm: (yes: boolean) => void;
  onBack: () => void;
}) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Review configuration</Text>
      <KeyValue
        items={appConfig.fields.map((field) => ({
          label: field.label,
          value: formatValue(getAtPath(draft, field.path) ?? field.defaultValue) || '(unset)',
        }))}
      />
      <Muted>File: {path}</Muted>
      <Muted>
        {changed ? 'Changes will be written on confirmation.' : 'Save current settings?'}
      </Muted>
      <Confirm message="Save configuration?" defaultValue onConfirm={onConfirm} onCancel={onBack} />
    </Box>
  );
}

/** Schema-driven setup wizard. Saves only after Review confirmation. */
export function ConfigWizard({
  path,
  onFinish,
}: {
  path?: string;
  onFinish?: (result: ConfigWizardResult) => void;
}) {
  useInputCapture(true);
  const draft = useConfigDraft(path);
  const [result, setResult] = useState<ConfigWizardResult>();
  const sections = configSections(appConfig.fields);

  const finish = (value: ConfigWizardResult) => {
    setResult(value);
    onFinish?.(value);
  };

  useKeymap([{key: 'esc', run: () => finish('cancelled')}], {
    scope: 'screen',
    allowWhenCaptured: true,
    isActive: Boolean(draft.error),
  });

  if (result)
    return (
      <StatusMessage tone={result === 'saved' ? 'success' : 'warn'}>
        {result === 'saved' ? `Configuration saved to ${draft.path}` : 'Configuration unchanged.'}
      </StatusMessage>
    );

  if (draft.error)
    return (
      <StatusMessage tone="danger">Configuration cannot be edited: {draft.error}</StatusMessage>
    );

  return (
    <Stepper
      keyboardNav={false}
      onComplete={() => finish('saved')}
      onCancel={() => finish('cancelled')}
      onError={() => {}}
    >
      {sections.map((section, index) => (
        <Step key={section} name={section}>
          {(context: StepContext) => (
            <ConfigSectionEditor
              fields={appConfig.fields.filter((field) => field.section === section)}
              values={draft.draft}
              onChange={draft.update}
              onBack={() => {
                if (index === 0) context.cancel();
                else void context.goBack();
              }}
              onDone={() => void context.goNext()}
            />
          )}
        </Step>
      ))}
      <Step
        name="Review"
        canProceed={() => {
          draft.save();

          return true;
        }}
      >
        {(context: StepContext) => (
          <Review
            draft={draft.draft}
            path={draft.path}
            changed={draft.changed}
            onBack={() => void context.goBack()}
            onConfirm={(yes) => {
              if (yes) void context.goNext();
              else context.cancel();
            }}
          />
        )}
      </Step>
    </Stepper>
  );
}
