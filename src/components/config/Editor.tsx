import {Box, Text, useInput} from 'ink';
import {useState} from 'react';
import type {ConfigField} from '../../config';
import {getAtPath} from '../../config';
import {useInputCapture} from '../../hooks/useInputCapture';
import {formatValue} from '../../lib/format';
import {useTheme} from '../../theme/context';
import {MultiSelect} from '../MultiSelect';
import {Select} from '../Select';
import {Muted} from '../typography';

const segments = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
function trimLast(text: string) {
  return [...segments.segment(text)]
    .slice(0, -1)
    .map((s) => s.segment)
    .join('');
}

function EditText({
  value,
  isNumber,
  onSubmit,
  onCancel,
}: {
  value: unknown;
  isNumber: boolean;
  onSubmit: (value: string | number) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(formatValue(value));
  const [error, setError] = useState('');
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const parsed = isNumber ? Number(text) : text;
      if (isNumber && (!text.trim() || !Number.isFinite(Number(text)))) {
        setError('Enter a valid number');
      } else onSubmit(parsed);
      return;
    }
    if (key.ctrl || key.meta) return;
    if (key.backspace || key.delete) {
      setText((current) => trimLast(current));
      setError('');
      return;
    }
    // Strip control characters Ink delivers for special keys.
    // oxlint-disable-next-line no-control-regex
    const printable = input.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
    if (printable) {
      setText((current) => current + printable);
      setError('');
    }
  });
  return (
    <Box flexDirection="column">
      <Text>Edit value: {text || '(empty)'}_</Text>
      {error && <Text color="red">{error}</Text>}
      <Muted>type to edit / backspace delete / enter accept / esc cancel</Muted>
    </Box>
  );
}

export interface ConfigSectionEditorProps {
  fields: readonly ConfigField[];
  values: object;
  onChange: (path: string, value: unknown) => void;
  onBack: () => void;
  onDone?: () => void;
  sources?: Record<string, string>;
  active?: boolean;
}

/** Shared between embedded Settings and the standalone setup wizard. */
export function ConfigSectionEditor({
  fields,
  values,
  onChange,
  onBack,
  onDone,
  sources,
  active = true,
}: ConfigSectionEditorProps) {
  const theme = useTheme();
  const visible = fields.filter(
    (field) => !field.visibleWhen || field.visibleWhen(values as Record<string, unknown>),
  );
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<'list' | 'select' | 'text' | 'multi'>('list');
  const field = visible[Math.min(index, visible.length - 1)];
  const value = field ? (getAtPath(values, field.path) ?? field.defaultValue) : undefined;
  useInputCapture(active);
  useInput(
    (input, key) => {
      if (mode !== 'list') {
        if (key.escape) setMode('list');
        return;
      }
      if (key.escape) {
        onBack();
        return;
      }
      if (key.upArrow) {
        setIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setIndex((i) => Math.min(visible.length - 1, i + 1));
        return;
      }
      if (input === 'n' && onDone) {
        onDone();
        return;
      }
      if (!key.return || !field) return;
      if (field.kind === 'toggle') onChange(field.path, !value);
      else if (field.kind === 'select') setMode('select');
      else if (field.kind === 'multi') setMode('multi');
      else setMode('text');
    },
    {isActive: active && (mode === 'list' || mode === 'select' || mode === 'multi')},
  );

  return (
    <Box flexDirection="column" gap={1}>
      {visible.length === 0 && <Muted>No settings in this section.</Muted>}
      {visible.map((item, i) => {
        const current = getAtPath(values, item.path) ?? item.defaultValue;
        const display = formatValue(current) || '(unset)';
        const source = sources?.[item.path];
        return (
          <Box key={item.path} flexDirection="column">
            <Text
              wrap="truncate-end"
              color={i === index ? theme.color.primary : theme.color.text}
              bold={i === index}
            >
              {i === index ? theme.symbols.pointer : ' '} {item.label}: {display}
              {source && source !== 'default' ? ` [${source}]` : ''}
            </Text>
            {i === index && item.description && <Muted>{item.description}</Muted>}
          </Box>
        );
      })}
      {active && field && mode === 'select' && (
        <Box flexDirection="column">
          <Select
            key={field.path}
            items={[...(field.options ?? [])]}
            initialValue={formatValue(value)}
            current={formatValue(value)}
            onSelect={(selection) => {
              onChange(field.path, selection);
              setMode('list');
            }}
          />
          <Muted>arrows choose / enter select / esc cancel</Muted>
        </Box>
      )}
      {active && field && mode === 'multi' && (
        <MultiSelect
          key={field.path}
          items={[...(field.options ?? [])]}
          defaultValue={Array.isArray(value) ? (value as string[]) : []}
          onSubmit={(selected) => {
            onChange(field.path, selected);
            setMode('list');
          }}
        />
      )}
      {active && field && mode === 'text' && (
        <EditText
          key={field.path}
          value={value}
          isNumber={field.kind === 'number'}
          onSubmit={(next) => {
            onChange(field.path, next);
            setMode('list');
          }}
          onCancel={() => setMode('list')}
        />
      )}
      {mode === 'list' && (
        <Muted>↑/↓ navigate / enter edit / esc back{onDone ? ' / n next' : ''}</Muted>
      )}
    </Box>
  );
}
