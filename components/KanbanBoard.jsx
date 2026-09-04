'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import TaskColumn from './TaskColumn';

const COLUMNS = [
  { status: 'todo', title: 'To do' },
  { status: 'in_progress', title: 'In progress' },
  { status: 'done', title: 'Done' },
];

const VALID_STATUSES = new Set(COLUMNS.map((column) => column.status));

function getStatusFromDragData(data) {
  const current = data?.current;

  if (VALID_STATUSES.has(current?.status)) {
    return current.status;
  }

  if (VALID_STATUSES.has(current?.task?.status)) {
    return current.task.status;
  }

  return null;
}

function getDestinationStatus(over) {
  if (!over) {
    return null;
  }

  const dataStatus = getStatusFromDragData(over.data);

  if (dataStatus) {
    return dataStatus;
  }

  const overId = String(over.id);

  if (VALID_STATUSES.has(overId)) {
    return overId;
  }

  const prefixedStatus = COLUMNS.find(
    ({ status }) =>
      overId === `column-${status}` || overId === `task-column-${status}`,
  )?.status;

  return prefixedStatus ?? null;
}

export default function KanbanBoard({
  tasks = [],
  onStatusChange,
  onEdit,
  onDelete,
}) {
  const [optimisticStatuses, setOptimisticStatuses] = useState({});
  const [dragError, setDragError] = useState('');
  const operationSequence = useRef(0);
  const latestOperations = useRef(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    setOptimisticStatuses((current) => {
      let changed = false;
      const next = {};

      Object.entries(current).forEach(([taskId, status]) => {
        const task = tasks.find(
          (candidate) => String(candidate.id) === String(taskId),
        );

        if (task && task.status !== status) {
          next[taskId] = status;
        } else {
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [tasks]);

  const displayedTasks = useMemo(
    () =>
      tasks.map((task) => {
        const optimisticStatus = optimisticStatuses[String(task.id)];

        return optimisticStatus
          ? { ...task, status: optimisticStatus }
          : task;
      }),
    [tasks, optimisticStatuses],
  );

  const tasksByStatus = useMemo(() => {
    const grouped = {
      todo: [],
      in_progress: [],
      done: [],
    };

    displayedTasks.forEach((task) => {
      if (VALID_STATUSES.has(task.status)) {
        grouped[task.status].push(task);
      }
    });

    return grouped;
  }, [displayedTasks]);

  const handleDragStart = useCallback(() => {
    setDragError('');
  }, []);

  const handleDragEnd = useCallback(
    async ({ active, over }) => {
      if (!over) {
        return;
      }

      const task = displayedTasks.find(
        (candidate) => String(candidate.id) === String(active.id),
      );

      if (!task) {
        return;
      }

      const sourceStatus = getStatusFromDragData(active.data) ?? task.status;
      const destinationStatus = getDestinationStatus(over);

      if (
        !destinationStatus ||
        !VALID_STATUSES.has(sourceStatus) ||
        sourceStatus === destinationStatus
      ) {
        return;
      }

      const taskKey = String(task.id);
      const operationId = ++operationSequence.current;
      latestOperations.current.set(taskKey, operationId);

      setOptimisticStatuses((current) => ({
        ...current,
        [taskKey]: destinationStatus,
      }));

      try {
        if (typeof onStatusChange !== 'function') {
          throw new Error('Task status updates are currently unavailable.');
        }

        await onStatusChange(task.id, destinationStatus);
      } catch (error) {
        if (latestOperations.current.get(taskKey) === operationId) {
          setDragError(
            error instanceof Error && error.message
              ? error.message
              : 'Unable to update the task status.',
          );
        }
      } finally {
        if (latestOperations.current.get(taskKey) === operationId) {
          latestOperations.current.delete(taskKey);
          setOptimisticStatuses((current) => {
            if (!(taskKey in current)) {
              return current;
            }

            const next = { ...current };
            delete next[taskKey];
            return next;
          });
        }
      }
    },
    [displayedTasks, onStatusChange],
  );

  return (
    <section aria-label="Task board">
      {dragError ? (
        <div className="error-message" role="alert">
          {dragError}
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="kanban-board">
          {COLUMNS.map(({ status, title }) => (
            <TaskColumn
              key={status}
              status={status}
              title={title}
              tasks={tasksByStatus[status]}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </DndContext>
    </section>
  );
}