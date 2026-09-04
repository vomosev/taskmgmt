import Link from "next/link";
import AuthForm from "../../components/AuthForm";

export const metadata = {
  title: "Log in | Taskmgmt",
  description: "Log in to manage your tasks and stay on top of your deadlines.",
};

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <div className="auth-header">
          <p className="eyebrow">Welcome back</p>
          <h1 id="login-heading">Log in to Taskmgmt</h1>
          <p>Access your dashboard, organize your work, and keep tasks moving.</p>
        </div>

        <AuthForm mode="login" />

        <p className="auth-switch">
          Don&apos;t have an account?{" "}
          <Link href="/signup">Create an account</Link>
        </p>
      </section>
    </main>
  );
}