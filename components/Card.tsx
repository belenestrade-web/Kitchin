import type { HTMLAttributes } from 'react';

export function Card({
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card bg-card shadow-card ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
