import Link from "next/link";
import AuthForm from "../../components/AuthForm";

export const metadata = {
  title: "Create account | Taskmgmt",
  description: "Create your Taskmgmt account to organize and manage your tasks.",
};

export default function SignupPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="signup-heading">
        <div className="auth-header">
          <p className="eyebrow">Get started</p>
          <h1 id="signup-heading">Create your account</h1>
          <p>
            Sign up with your name, email address, and password to start managing
            your tasks.
          </p>
        </div>

        <AuthForm mode="signup" />

        <p className="auth-switch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}