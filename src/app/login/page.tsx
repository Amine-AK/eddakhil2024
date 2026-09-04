"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        <h1 className="mb-1 text-center text-xl font-bold text-slate-800">نظام الحضور والدخول المدرسي</h1>
        <p className="mb-6 text-center text-sm text-slate-500">School Attendance System</p>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">البريد الإلكتروني</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="tap-target w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">كلمة المرور</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="tap-target w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="tap-target w-full rounded-lg bg-blue-700 py-3 text-base font-semibold text-white disabled:opacity-50"
        >
          {loading ? "جارٍ الدخول..." : "دخول"}
        </button>
      </form>
    </main>
  );
}
