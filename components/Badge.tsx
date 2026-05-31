import type { ReactNode } from 'react';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger';

const variants: Record<BadgeVariant, string> = {
  neutral: 'bg-text-muted/15 text-text-main',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
};

export function Badge({
  variant = 'neutral',
  children,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
