'use client';

import { useDroppable } from '@dnd-kit/core';
import TaskCard from './TaskCard';

export default function TaskColumn({
  status,
  title,
  tasks = [],
  onEdit,
  onDelete,
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: status,
    data: {
      type: 'column',
      status,
    },
  });

  const taskList = Array.isArray(tasks) ? tasks : [];
  const headingId = `task-column-${status}-heading`;

  return (
    <section
      ref={setNodeRef}
      className={`task-column${isOver ? ' task-column--over' : ''}`}
      aria-labelledby={headingId}
      data-status={status}
    >
      <header className="task-column-header">
        <h2 id={headingId} className="task-column-title">
          {title}
        </h2>
        <span
          className="task-count"
          aria-label={`${taskList.length} ${
            taskList.length === 1 ? 'task' : 'tasks'
          }`}
        >
          {taskList.length}
        </span>
      </header>

      <div className="task-column-content">
        {taskList.length > 0 ? (
          taskList.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        ) : (
          <div className="task-column-empty" role="status">
            <p>No tasks in this column.</p>
          </div>
        )}
      </div>
    </section>
  );
}