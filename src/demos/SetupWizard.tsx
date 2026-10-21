import {Box, Text, useInput} from 'ink';
import {useState} from 'react';
import {
  Confirm,
  KeyValue,
  Muted,
  Select,
  Spinner,
  StatusMessage,
  Step,
  Stepper,
  StepperNavigation,
  useStepper,
} from '../components';

export type WizardResult = 'completed' | 'cancelled';

function TemplateStep({
  onSelect,
  isActive,
}: {
  onSelect: (value: string) => void;
  isActive: boolean;
}) {
  const {goNext, goBack} = useStepper();
  useInput(
    (_input, key) => {
      if (key.escape) void goBack();
    },
    {isActive},
  );
  return (
    <Box flexDirection="column">
      <Text>Choose a starter template</Text>
      <Select
        isActive={isActive}
        items={[
          {value: 'minimal', label: 'Minimal command'},
          {value: 'dashboard', label: 'Dashboard'},
        ]}
        onSelect={(value) => {
          onSelect(value);
          void goNext();
        }}
      />
      <Muted>arrows choose / enter select / esc back</Muted>
    </Box>
  );
}

function ReviewStep({template, isActive}: {template: string; isActive: boolean}) {
  const {goNext, goBack, cancel, isValidating} = useStepper();
  useInput(
    (_input, key) => {
      if (key.escape) void goBack();
    },
    {isActive},
  );
  return (
    <Box flexDirection="column" gap={1}>
      <KeyValue
        items={[
          {label: 'Project', value: 'my-cli'},
          {label: 'Template', value: template},
        ]}
      />
      {isValidating ? (
        <Spinner label="Validating setup" />
      ) : (
        <Confirm
          isActive={isActive}
          message="Finish the demo setup?"
          defaultValue
          onConfirm={(yes) => {
            if (yes) void goNext();
            else cancel();
          }}
        />
      )}
      <Muted>esc back / no cancels / no files are created</Muted>
    </Box>
  );
}

/** Demo wizard used by the Stepper tests. */
export function SetupWizard({
  onFinish,
  isActive = true,
}: {
  onFinish?: (result: WizardResult) => void;
  isActive?: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const [template, setTemplate] = useState('minimal');
  const [result, setResult] = useState<WizardResult>();
  const finish = (next: WizardResult) => {
    setResult(next);
    onFinish?.(next);
  };
  if (result)
    return (
      <StatusMessage tone={result === 'completed' ? 'success' : 'warn'}>
        {result === 'completed'
          ? `Setup complete: my-cli (${template}). No files were created.`
          : 'Setup cancelled. No files were created.'}
      </StatusMessage>
    );
  return (
    <Stepper
      keyboardNav={isActive && current === 0}
      onStepChange={setCurrent}
      onComplete={() => finish('completed')}
      onCancel={() => finish('cancelled')}
    >
      <Step name="Welcome">
        <Box flexDirection="column" gap={1}>
          <Text>Set up a CLI in three short steps.</Text>
          <Muted>This wizard stays in normal terminal scrollback.</Muted>
          <StepperNavigation />
        </Box>
      </Step>
      <Step name="Template">
        <TemplateStep isActive={isActive} onSelect={setTemplate} />
      </Step>
      <Step
        name="Review"
        canProceed={() => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 500))}
      >
        <ReviewStep isActive={isActive} template={template} />
      </Step>
    </Stepper>
  );
}
