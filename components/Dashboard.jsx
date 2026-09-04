'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { taskApi } from '../lib/api';
import KanbanBoard from './KanbanBoard';
import TaskModal from './TaskModal';

const API_METHODS = {
  list: ['listTasks', 'getTasks', 'list'],
  create: ['createTask', 'create'],
  update: ['updateTask', 'update'],
  updateStatus: ['updateTaskStatus', 'updateStatus'],
  delete: ['deleteTask', 'delete'],
};

function getTaskApiMethod(type) {
  const methodName = API_METHODS[type].find(
    (name) => typeof taskApi[name] === 'function',
  );

  if (!methodName) {
    throw new Error(`Task API method "${type}" is unavailable.`);
  }

  return taskApi[methodName].bind(taskApi);
}

function getErrorMessage(error, fallback) {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error?.message) {
    return error.message;
  }

  if (error?.error) {
    return error.error;
  }

  return fallback;
}

function extractTasks(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.tasks)) {
    return response.tasks;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.data?.tasks)) {
    return response.data.tasks;
  }

  throw new Error('The server returned an invalid task list.');
}

function extractTask(response) {
  if (response?.task) {
    return response.task;
  }

  if (response?.data?.task) {
    return response.data.task;
  }

  if (response && typeof response === 'object' && response.id != null) {
    return response;
  }

  return null;
}

function isUnauthorized(error) {
  return error?.status === 401 || error?.statusCode === 401;
}

export default function Dashboard() {
  const router = useRouter();
  const {
    user,
    token,
    loading: authLoading,
    logout,
  } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [hasLoadedTasks, setHasLoadedTasks] = useState(false);
  const [error, setError] = useState('');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);

  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!authLoading && (!user || !token)) {
      router.replace('/login');
    }
  }, [authLoading, router, token, user]);

  const endExpiredSession = useCallback(async () => {
    try {
      await logout();
    } finally {
      router.replace('/login');
    }
  }, [logout, router]);

  const loadTasks = useCallback(async () => {
    if (!token) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setTasksLoading(true);
    setError('');

    try {
      const listTasks = getTaskApiMethod('list');
      const response = await listTasks(token);
      const nextTasks = extractTasks(response);

      if (mountedRef.current && requestId === requestIdRef.current) {
        setTasks(nextTasks);
      }
    } catch (loadError) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      if (isUnauthorized(loadError)) {
        await endExpiredSession();
        return;
      }

      setError(
        getErrorMessage(
          loadError,
          'We could not load your tasks. Please try again.',
        ),
      );
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setTasksLoading(false);
        setHasLoadedTasks(true);
      }
    }
  }, [endExpiredSession, token]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (user && token) {
      setHasLoadedTasks(false);
      setTasks([]);
      loadTasks();
    }
  }, [authLoading, loadTasks, token, user]);

  const counts = useMemo(
    () =>
      tasks.reduce(
        (summary, task) => {
          summary.total += 1;

          if (Object.prototype.hasOwnProperty.call(summary, task.status)) {
            summary[task.status] += 1;
          }

          return summary;
        },
        {
          total: 0,
          todo: 0,
          in_progress: 0,
          done: 0,
        },
      ),
    [tasks],
  );

  const openCreateModal = useCallback(() => {
    setError('');
    setSelectedTask(null);
    setIsTaskModalOpen(true);
  }, []);

  const openEditModal = useCallback((task) => {
    setError('');
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  }, []);

  const closeTaskModal = useCallback(() => {
    setIsTaskModalOpen(false);
    setSelectedTask(null);
  }, []);

  const handleTaskSubmit = useCallback(
    async (taskInput) => {
      if (!token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      setError('');

      try {
        let response;

        if (selectedTask) {
          const updateTask = getTaskApiMethod('update');
          response = await updateTask(token, selectedTask.id, taskInput);
        } else {
          const createTask = getTaskApiMethod('create');
          response = await createTask(token, taskInput);
        }

        const savedTask = extractTask(response);

        if (savedTask) {
          setTasks((currentTasks) => {
            if (!selectedTask) {
              return [...currentTasks, savedTask];
            }

            return currentTasks.map((task) =>
              String(task.id) === String(selectedTask.id) ? savedTask : task,
            );
          });
        } else {
          await loadTasks();
        }

        closeTaskModal();
        return savedTask;
      } catch (submitError) {
        if (isUnauthorized(submitError)) {
          await endExpiredSession();
        }

        const message = getErrorMessage(
          submitError,
          selectedTask
            ? 'We could not update this task. Please try again.'
            : 'We could not create this task. Please try again.',
        );

        setError(message);
        throw new Error(message);
      }
    },
    [
      closeTaskModal,
      endExpiredSession,
      loadTasks,
      selectedTask,
      token,
    ],
  );

  const handleStatusChange = useCallback(
    async (taskId, nextStatus) => {
      if (!token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const previousTask = tasks.find(
        (task) => String(task.id) === String(taskId),
      );

      if (!previousTask || previousTask.status === nextStatus) {
        return;
      }

      setError('');
      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          String(task.id) === String(taskId)
            ? { ...task, status: nextStatus }
            : task,
        ),
      );

      try {
        const updateTaskStatus = getTaskApiMethod('updateStatus');
        const response = await updateTaskStatus(token, taskId, nextStatus);
        const updatedTask = extractTask(response);

        if (updatedTask) {
          setTasks((currentTasks) =>
            currentTasks.map((task) =>
              String(task.id) === String(taskId) ? updatedTask : task,
            ),
          );
        }
      } catch (statusError) {
        setTasks((currentTasks) =>
          currentTasks.map((task) =>
            String(task.id) === String(taskId) ? previousTask : task,
          ),
        );

        if (isUnauthorized(statusError)) {
          await endExpiredSession();
        }

        const message = getErrorMessage(
          statusError,
          'We could not move this task. Its previous status has been restored.',
        );
        setError(message);
        throw new Error(message);
      }
    },
    [endExpiredSession, tasks, token],
  );

  const handleDeleteTask = useCallback(
    async (task) => {
      if (!token || deletingTaskId != null) {
        return;
      }

      const confirmed = window.confirm(
        `Delete “${task.title}”? This action cannot be undone.`,
      );

      if (!confirmed) {
        return;
      }

      setError('');
      setDeletingTaskId(task.id);

      try {
        const deleteTask = getTaskApiMethod('delete');
        await deleteTask(token, task.id);

        setTasks((currentTasks) =>
          currentTasks.filter(
            (currentTask) => String(currentTask.id) !== String(task.id),
          ),
        );

        if (
          selectedTask &&
          String(selectedTask.id) === String(task.id)
        ) {
          closeTaskModal();
        }
      } catch (deleteError) {
        if (isUnauthorized(deleteError)) {
          await endExpiredSession();
        }

        setError(
          getErrorMessage(
            deleteError,
            'We could not delete this task. Please try again.',
          ),
        );
      } finally {
        if (mountedRef.current) {
          setDeletingTaskId(null);
        }
      }
    },
    [
      closeTaskModal,
      deletingTaskId,
      endExpiredSession,
      selectedTask,
      token,
    ],
  );

  const handleLogout = useCallback(async () => {
    setError('');

    try {
      await logout();
      router.replace('/login');
    } catch (logoutError) {
      setError(
        getErrorMessage(
          logoutError,
          'We could not sign you out. Please try again.',
        ),
      );
    }
  }, [logout, router]);

  if (authLoading || (!user && !token)) {
    return (
      <main className="dashboard-page">
        <div className="loading-state" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <p>Checking your session…</p>
        </div>
      </main>
    );
  }

  if (!user || !token) {
    return null;
  }

  const displayName = user.name?.trim() || user.email || 'there';
  const isInitialLoad = tasksLoading && !hasLoadedTasks;

  return (
    <main className="dashboard dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-heading">
          <p className="eyebrow">Your workspace</p>
          <h1>Welcome back, {displayName}</h1>
          <p className="dashboard-subtitle">
            Plan your work, track progress, and keep important due dates in
            view.
          </p>
        </div>

        <div className="dashboard-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={loadTasks}
            disabled={tasksLoading}
          >
            {tasksLoading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={openCreateModal}
          >
            New task
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      </header>

      <section
        className="dashboard-summary summary-grid"
        aria-label="Task summary"
      >
        <article className="summary-card">
          <span className="summary-label">All tasks</span>
          <strong className="summary-value">{counts.total}</strong>
        </article>
        <article className="summary-card summary-card-todo">
          <span className="summary-label">To do</span>
          <strong className="summary-value">{counts.todo}</strong>
        </article>
        <article className="summary-card summary-card-progress">
          <span className="summary-label">In progress</span>
          <strong className="summary-value">{counts.in_progress}</strong>
        </article>
        <article className="summary-card summary-card-done">
          <span className="summary-label">Done</span>
          <strong className="summary-value">{counts.done}</strong>
        </article>
      </section>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="error-dismiss"
            onClick={() => setError('')}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <section className="board-section" aria-labelledby="task-board-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Kanban board</p>
            <h2 id="task-board-heading">Your tasks</h2>
          </div>
          {tasksLoading && hasLoadedTasks && (
            <span className="refresh-status" role="status" aria-live="polite">
              Refreshing tasks…
            </span>
          )}
        </div>

        {isInitialLoad ? (
          <div className="loading-state" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <p>Loading your tasks…</p>
          </div>
        ) : (
          <KanbanBoard
            tasks={tasks}
            onEdit={openEditModal}
            onDelete={handleDeleteTask}
            onStatusChange={handleStatusChange}
          />
        )}
      </section>

      <TaskModal
        task={selectedTask}
        isOpen={isTaskModalOpen}
        onClose={closeTaskModal}
        onSubmit={handleTaskSubmit}
      />
    </main>
  );
}