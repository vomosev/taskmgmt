import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-brand" aria-label="Taskmgmt">
          <span className="landing-brand-mark" aria-hidden="true">
            ✓
          </span>
          <span>Taskmgmt</span>
        </div>

        <p className="landing-eyebrow">Plan clearly. Finish confidently.</p>

        <h1 id="landing-title">
          Keep every task moving forward.
        </h1>

        <p className="landing-description">
          Organize work on a simple kanban board, track progress at a glance,
          and receive reminders when important tasks are due.
        </p>

        <nav className="landing-actions" aria-label="Account navigation">
          <Link className="button button-primary" href="/signup">
            Create an account
          </Link>
          <Link className="button button-secondary" href="/login">
            Log in
          </Link>
        </nav>

        <ul className="landing-features" aria-label="Taskmgmt features">
          <li>Drag-and-drop planning</li>
          <li>Due-date notifications</li>
          <li>Private, secure workspace</li>
        </ul>
      </section>
    </main>
  );
}