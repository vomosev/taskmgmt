'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

const INITIAL_VALUES = {
  name: '',
  email: '',
  password: '',
};

function getErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string') return error.message;
  if (typeof error.error === 'string') return error.error;
  return 'Unable to complete your request. Please try again.';
}

export default function AuthForm({ mode }) {
  const router = useRouter();
  const {
    user,
    login,
    signup,
    loading: authLoading,
    error: authError,
  } = useAuth();

  const isSignup = mode === 'signup';
  const isLogin = mode === 'login';
  const submissionLock = useRef(false);

  const [values, setValues] = useState(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submissionError, setSubmissionError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace('/dashboard');
      router.refresh();
    }
  }, [router, user]);

  useEffect(() => {
    setValues(INITIAL_VALUES);
    setFieldErrors({});
    setSubmissionError('');
    submissionLock.current = false;
    setIsSubmitting(false);
  }, [mode]);

  if (!isLogin && !isSignup) {
    return (
      <div className="error-message" role="alert">
        Invalid authentication form mode.
      </div>
    );
  }

  const validate = () => {
    const errors = {};
    const name = values.name.trim();
    const email = values.email.trim();

    if (isSignup) {
      if (!name) {
        errors.name = 'Name is required.';
      } else if (name.length > 100) {
        errors.name = 'Name must be 100 characters or fewer.';
      }
    }

    if (!email) {
      errors.email = 'Email address is required.';
    } else if (email.length > 254) {
      errors.email = 'Email address is too long.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Enter a valid email address.';
    }

    if (!values.password) {
      errors.password = 'Password is required.';
    } else if (isSignup && values.password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    } else if (values.password.length > 72) {
      errors.password = 'Password must be 72 characters or fewer.';
    }

    return errors;
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setValues((current) => ({
      ...current,
      [name]: value,
    }));

    setFieldErrors((current) => {
      if (!current[name]) return current;

      const next = { ...current };
      delete next[name];
      return next;
    });

    if (submissionError) {
      setSubmissionError('');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submissionLock.current || isSubmitting || authLoading) {
      return;
    }

    const errors = validate();
    setFieldErrors(errors);
    setSubmissionError('');

    if (Object.keys(errors).length > 0) {
      const firstInvalidField = Object.keys(errors)[0];
      document.getElementById(`${mode}-${firstInvalidField}`)?.focus();
      return;
    }

    submissionLock.current = true;
    setIsSubmitting(true);

    const email = values.email.trim().toLowerCase();

    try {
      if (isSignup) {
        await signup(values.name.trim(), email, values.password);
      } else {
        await login(email, values.password);
      }

      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      setSubmissionError(getErrorMessage(error));
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  };

  if (user) {
    return (
      <div className="loading-state" role="status" aria-live="polite">
        Taking you to your dashboard…
      </div>
    );
  }

  if (authLoading && !isSubmitting) {
    return (
      <div className="loading-state" role="status" aria-live="polite">
        Loading your account…
      </div>
    );
  }

  const displayedError =
    submissionError || (!isSubmitting ? getErrorMessage(authError) : '');

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      {displayedError ? (
        <div className="error-message error-banner" role="alert">
          {displayedError}
        </div>
      ) : null}

      {isSignup ? (
        <div className="form-group">
          <label htmlFor={`${mode}-name`}>Name</label>
          <input
            id={`${mode}-name`}
            name="name"
            type="text"
            value={values.name}
            onChange={handleChange}
            autoComplete="name"
            maxLength={100}
            disabled={isSubmitting}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={
              fieldErrors.name ? `${mode}-name-error` : undefined
            }
            required
          />
          {fieldErrors.name ? (
            <p
              id={`${mode}-name-error`}
              className="field-error"
              role="alert"
            >
              {fieldErrors.name}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="form-group">
        <label htmlFor={`${mode}-email`}>Email address</label>
        <input
          id={`${mode}-email`}
          name="email"
          type="email"
          value={values.email}
          onChange={handleChange}
          autoComplete={isSignup ? 'email' : 'username'}
          inputMode="email"
          maxLength={254}
          disabled={isSubmitting}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={
            fieldErrors.email ? `${mode}-email-error` : undefined
          }
          required
        />
        {fieldErrors.email ? (
          <p
            id={`${mode}-email-error`}
            className="field-error"
            role="alert"
          >
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="form-group">
        <label htmlFor={`${mode}-password`}>Password</label>
        <input
          id={`${mode}-password`}
          name="password"
          type="password"
          value={values.password}
          onChange={handleChange}
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          maxLength={72}
          disabled={isSubmitting}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={
            fieldErrors.password
              ? `${mode}-password-error`
              : isSignup
                ? `${mode}-password-help`
                : undefined
          }
          required
        />
        {isSignup && !fieldErrors.password ? (
          <p id={`${mode}-password-help`} className="field-hint">
            Use at least 8 characters.
          </p>
        ) : null}
        {fieldErrors.password ? (
          <p
            id={`${mode}-password-error`}
            className="field-error"
            role="alert"
          >
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <button
        className="button button-primary auth-submit"
        type="submit"
        disabled={isSubmitting || authLoading}
        aria-busy={isSubmitting}
      >
        {isSubmitting
          ? isSignup
            ? 'Creating account…'
            : 'Signing in…'
          : isSignup
            ? 'Create account'
            : 'Sign in'}
      </button>
    </form>
  );
}