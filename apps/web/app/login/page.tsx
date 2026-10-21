import { LoginForm } from "../../src/components/login-form";

export default function LoginPage() {
  return (
    <main className="page">
      <div className="login-shell">
        <h1>CS Skin Tracker</h1>
        <h2>Sign In</h2>
        <LoginForm />
      </div>
    </main>
  );
}
