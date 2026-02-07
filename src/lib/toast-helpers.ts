import type React from 'react';

const SUCCESS_CLASS = "bg-[#343A5C] border-purple-800 text-purple-200";

type ToastFn = (opts: {
  title: string;
  description?: React.ReactNode;
  className?: string;
  variant?: "default" | "destructive";
}) => void;

export function toastSuccess(toast: ToastFn, title: string, description?: React.ReactNode): void {
  toast({ title, description, className: SUCCESS_CLASS });
}

export function toastError(toast: ToastFn, title: string, description?: React.ReactNode): void {
  toast({ title, description, variant: "destructive" });
}
