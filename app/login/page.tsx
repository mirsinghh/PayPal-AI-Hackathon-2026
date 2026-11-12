import { Suspense } from "react";
import { AuthForm } from "@/components/v5/AuthForm";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
