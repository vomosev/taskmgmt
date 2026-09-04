'use client';

import { useDraggable } from '@dnd-kit/core';

const STATUS_LABELS = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatStatus(status) {
  if (STATUS_LABELS[status]) {
    return STATUS_LABELS[status];
  }

  return String(status || 'Unknown')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getDueDate(task) {
  const value = task?.dueDate ?? task?.due_date;

  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function TaskCard({ task, onEdit, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: task.id,
    data: {
      task,
      status: task.status,
    },
  });

  const dueDate = getDueDate(task);
  const isOverdue =
    Boolean(dueDate) &&
    dueDate.getTime() < Date.now() &&
    task.status !== 'done';

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 10 : undefined,
      }
    : undefined;

  const stopDragActivation = (event) => {
    event.stopPropagation();
  };

  const handleEdit = (event) => {
    event.stopPropagation();
    onEdit?.(task);
  };

  const handleDelete = (event) => {
    event.stopPropagation();
    onDelete?.(task.id);
  };

  const statusLabel = formatStatus(task.status);

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={[
        'task-card',
        isOverdue ? 'task-card--overdue overdue' : '',
        isDragging ? 'task-card--dragging is-dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-status={task.status}
      aria-label={`${task.title}, ${statusLabel}${isOverdue ? ', overdue' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="task-card-header">
        <h3 className="task-card-title">{task.title}</h3>
        <span className={`status-badge status-badge--${task.status}`}>
          {statusLabel}
        </span>
      </div>

      {task.description ? (
        <p className="task-card-description">{task.description}</p>
      ) : null}

      <div className="task-card-footer">
        <div
          className={`task-card-due-date${isOverdue ? ' task-card-due-date--overdue' : ''}`}
        >
          <span className="task-card-due-label">Due</span>
          {dueDate ? (
            <time dateTime={dueDate.toISOString()}>
              {dateFormatter.format(dueDate)}
              {isOverdue ? <span className="sr-only"> (overdue)</span> : null}
            </time>
          ) : (
            <span>No due date</span>
          )}
        </div>

        <div className="task-card-actions" aria-label={`Actions for ${task.title}`}>
          <button
            type="button"
            className="button button-secondary button-small task-card-action"
            onPointerDown={stopDragActivation}
            onMouseDown={stopDragActivation}
            onTouchStart={stopDragActivation}
            onKeyDown={stopDragActivation}
            onKeyUp={stopDragActivation}
            onClick={handleEdit}
            aria-label={`Edit ${task.title}`}
          >
            Edit
          </button>
          <button
            type="button"
            className="button button-danger button-small task-card-action"
            onPointerDown={stopDragActivation}
            onMouseDown={stopDragActivation}
            onTouchStart={stopDragActivation}
            onKeyDown={stopDragActivation}
            onKeyUp={stopDragActivation}
            onClick={handleDelete}
            aria-label={`Delete ${task.title}`}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}