import { SignInButton } from '@clerk/nextjs';

export default function LoginButton() {
  return (
    <SignInButton>
      <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
        Log in
      </button>
    </SignInButton>
  );
}
