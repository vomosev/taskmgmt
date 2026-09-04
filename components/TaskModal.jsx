'use client';

import { useEffect, useId, useRef, useState } from 'react';

const TASK_STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

const TITLE_MAX_LENGTH = 255;
const DESCRIPTION_MAX_LENGTH = 5000;

function formatDateTimeLocal(value) {
  if (!value) {
    return '';
  }

  const rawValue = String(value).trim();
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawValue);

  if (!hasExplicitTimezone) {
    const localMatch = rawValue.match(
      /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/,
    );

    if (localMatch) {
      return `${localMatch[1]}T${localMatch[2]}`;
    }
  }

  const date = value instanceof Date ? value : new Date(rawValue);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (number) => String(number).padStart(2, '0');

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}

function getApiErrorMessage(error) {
  if (!error) {
    return 'Unable to save the task. Please try again.';
  }

  if (Array.isArray(error.details) && error.details.length > 0) {
    return error.details
      .map((detail) =>
        typeof detail === 'string'
          ? detail
          : detail?.message || detail?.error || String(detail),
      )
      .join(' ');
  }

  if (typeof error.details === 'string' && error.details.trim()) {
    return error.details;
  }

  if (error.details && typeof error.details === 'object') {
    const messages = Object.values(error.details).filter(
      (value) => typeof value === 'string' && value.trim(),
    );

    if (messages.length > 0) {
      return messages.join(' ');
    }
  }

  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return 'Unable to save the task. Please try again.';
}

export default function TaskModal({
  task = null,
  isOpen,
  onClose,
  onSubmit,
}) {
  const idPrefix = useId();
  const dialogRef = useRef(null);
  const titleInputRef = useRef(null);
  const descriptionInputRef = useRef(null);
  const statusInputRef = useRef(null);
  const dueDateInputRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const submittingRef = useRef(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('todo');
  const [dueDate, setDueDate] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  onCloseRef.current = onClose;
  submittingRef.current = isSubmitting;

  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-description`;
  const statusId = `${idPrefix}-status`;
  const dueDateId = `${idPrefix}-due-date`;
  const headingId = `${idPrefix}-heading`;
  const instructionsId = `${idPrefix}-instructions`;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const initialStatus = TASK_STATUSES.some(
      ({ value }) => value === task?.status,
    )
      ? task.status
      : 'todo';

    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setStatus(initialStatus);
    setDueDate(formatDateTimeLocal(task?.dueDate ?? task?.due_date));
    setErrors({});
    setApiError('');
    setIsSubmitting(false);
  }, [isOpen, task]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previouslyFocusedElement = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();

        if (!submittingRef.current) {
          onCloseRef.current?.();
        }

        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element instanceof HTMLElement &&
          element.getAttribute('aria-hidden') !== 'true' &&
          element.offsetParent !== null,
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;

      if (
        previouslyFocusedElement instanceof HTMLElement &&
        previouslyFocusedElement.isConnected
      ) {
        previouslyFocusedElement.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const clearFieldError = (field) => {
    setErrors((currentErrors) => {
      if (!currentErrors[field]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      return nextErrors;
    });

    if (apiError) {
      setApiError('');
    }
  };

  const validate = () => {
    const nextErrors = {};
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      nextErrors.title = 'Enter a task title.';
    } else if (normalizedTitle.length > TITLE_MAX_LENGTH) {
      nextErrors.title = `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`;
    }

    if (description.length > DESCRIPTION_MAX_LENGTH) {
      nextErrors.description = `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
    }

    if (!TASK_STATUSES.some(({ value }) => value === status)) {
      nextErrors.status = 'Select a valid task status.';
    }

    if (dueDate) {
      const parsedDueDate = new Date(dueDate);

      if (Number.isNaN(parsedDueDate.getTime())) {
        nextErrors.dueDate = 'Enter a valid due date and time.';
      }
    }

    setErrors(nextErrors);

    const firstInvalidField = [
      ['title', titleInputRef],
      ['description', descriptionInputRef],
      ['status', statusInputRef],
      ['dueDate', dueDateInputRef],
    ].find(([field]) => nextErrors[field]);

    if (firstInvalidField) {
      window.setTimeout(() => firstInvalidField[1].current?.focus(), 0);
    }

    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSubmitting || !validate()) {
      return;
    }

    if (typeof onSubmit !== 'function') {
      setApiError('Task saving is currently unavailable.');
      return;
    }

    setIsSubmitting(true);
    setApiError('');

    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        status,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });

      onCloseRef.current?.();
    } catch (error) {
      setApiError(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget && !isSubmitting) {
      onCloseRef.current?.();
    }
  };

  const isEditing = Boolean(task);

  return (
    <div
      className="modal-backdrop modal-overlay"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={dialogRef}
        className="modal modal-content task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={instructionsId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <h2 id={headingId}>
              {isEditing ? 'Edit task' : 'Create a task'}
            </h2>
            <p id={instructionsId} className="modal-description">
              {isEditing
                ? 'Update the task details and save your changes.'
                : 'Add a task to your board. You can change its status at any time.'}
            </p>
          </div>

          <button
            type="button"
            className="icon-button modal-close"
            onClick={() => onCloseRef.current?.()}
            disabled={isSubmitting}
            aria-label="Close task dialog"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <form className="modal-form task-form" onSubmit={handleSubmit} noValidate>
          {apiError ? (
            <div className="error-message form-alert" role="alert">
              {apiError}
            </div>
          ) : null}

          <div className="form-group">
            <label htmlFor={titleId}>
              Title <span aria-hidden="true">*</span>
            </label>
            <input
              ref={titleInputRef}
              id={titleId}
              name="title"
              type="text"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                clearFieldError('title');
              }}
              maxLength={TITLE_MAX_LENGTH}
              autoComplete="off"
              required
              disabled={isSubmitting}
              aria-required="true"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={
                errors.title ? `${titleId}-error` : `${titleId}-help`
              }
              placeholder="e.g. Prepare project update"
            />
            <div className="field-meta">
              <span id={`${titleId}-help`} className="field-hint">
                Give the task a short, clear name.
              </span>
              <span className="character-count" aria-hidden="true">
                {title.length}/{TITLE_MAX_LENGTH}
              </span>
            </div>
            {errors.title ? (
              <p id={`${titleId}-error`} className="form-error" role="alert">
                {errors.title}
              </p>
            ) : null}
          </div>

          <div className="form-group">
            <label htmlFor={descriptionId}>Description</label>
            <textarea
              ref={descriptionInputRef}
              id={descriptionId}
              name="description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                clearFieldError('description');
              }}
              maxLength={DESCRIPTION_MAX_LENGTH}
              rows={5}
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={
                errors.description
                  ? `${descriptionId}-error`
                  : `${descriptionId}-help`
              }
              placeholder="Add useful context, notes, or acceptance criteria"
            />
            <div className="field-meta">
              <span id={`${descriptionId}-help`} className="field-hint">
                Optional details to help complete the task.
              </span>
              <span className="character-count" aria-hidden="true">
                {description.length}/{DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
            {errors.description ? (
              <p
                id={`${descriptionId}-error`}
                className="form-error"
                role="alert"
              >
                {errors.description}
              </p>
            ) : null}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor={statusId}>Status</label>
              <select
                ref={statusInputRef}
                id={statusId}
                name="status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  clearFieldError('status');
                }}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.status)}
                aria-describedby={
                  errors.status ? `${statusId}-error` : undefined
                }
              >
                {TASK_STATUSES.map((taskStatus) => (
                  <option key={taskStatus.value} value={taskStatus.value}>
                    {taskStatus.label}
                  </option>
                ))}
              </select>
              {errors.status ? (
                <p id={`${statusId}-error`} className="form-error" role="alert">
                  {errors.status}
                </p>
              ) : null}
            </div>

            <div className="form-group">
              <label htmlFor={dueDateId}>Due date</label>
              <input
                ref={dueDateInputRef}
                id={dueDateId}
                name="dueDate"
                type="datetime-local"
                value={dueDate}
                onChange={(event) => {
                  setDueDate(event.target.value);
                  clearFieldError('dueDate');
                }}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.dueDate)}
                aria-describedby={
                  errors.dueDate
                    ? `${dueDateId}-error`
                    : `${dueDateId}-help`
                }
              />
              <span id={`${dueDateId}-help`} className="field-hint">
                Optional. Times are interpreted in your local timezone.
              </span>
              {errors.dueDate ? (
                <p
                  id={`${dueDateId}-error`}
                  className="form-error"
                  role="alert"
                >
                  {errors.dueDate}
                </p>
              ) : null}
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => onCloseRef.current?.()}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="button-spinner spinner" aria-hidden="true" />
                  <span>{isEditing ? 'Saving…' : 'Creating…'}</span>
                </>
              ) : (
                <span>{isEditing ? 'Save changes' : 'Create task'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}