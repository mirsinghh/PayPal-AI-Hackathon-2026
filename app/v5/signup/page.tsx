import { Suspense } from "react";
import { AuthForm } from "@/components/v5/AuthForm";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
