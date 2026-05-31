import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kitchin — Presupuestos de cocinas',
  description:
    'Genera presupuestos de cocinas en minutos con análisis automático del plano.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
