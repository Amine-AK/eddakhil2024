import { SignOutButton } from "@/components/sign-out-button";

export function AppHeader({ title, userName }: { title: string; userName: string }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
      <div>
        <h1 className="text-lg font-bold text-slate-800">{title}</h1>
        <p className="text-xs text-slate-500">{userName}</p>
      </div>
      <SignOutButton />
    </header>
  );
}
