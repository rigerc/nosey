import {Box, Text} from 'ink';
import {useElapsed} from '../hooks/useElapsed';
import {formatDuration} from '../lib/format';
import {useTone} from '../theme/context';
import {Spinner} from './Spinner';
import {Icon, Muted} from './typography';

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

export interface Task {
  id: string;
  label: string;
  status: TaskStatus;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
}

function TaskRow({task}: {task: Task}) {
  const elapsed = useElapsed(task.startedAt, task.endedAt);
  const labelStyle = useTone('muted');
  const detailStyle = useTone(task.status === 'failed' ? 'danger' : 'muted');

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        {task.status === 'running' && <Spinner />}
        {task.status === 'done' && <Icon name="success" />}
        {task.status === 'failed' && <Icon name="error" />}
        {task.status === 'pending' && <Icon name="pending" />}
        <Text wrap="truncate-end" {...(task.status === 'pending' ? labelStyle : {})}>
          {task.label}
        </Text>
        {task.startedAt !== undefined && <Muted>{formatDuration(elapsed)}</Muted>}
      </Box>
      {task.detail && (
        <Box paddingLeft={2}>
          <Text {...detailStyle} wrap="truncate-end">
            {task.detail}
          </Text>
        </Box>
      )}
    </Box>
  );
}

/** Pending / running / done / failed rows with live elapsed time. */
export function TaskList({tasks}: {tasks: Task[]}) {
  return (
    <Box flexDirection="column">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </Box>
  );
}
