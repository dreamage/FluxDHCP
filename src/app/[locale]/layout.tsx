import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '../../i18n/routing';
import Providers from '@/components/Providers';
import AppLayout from '@/components/AppLayout';
import { AntdRegistry } from '@ant-design/nextjs-registry';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as 'en' | 'zh')) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <AntdRegistry>
      <NextIntlClientProvider messages={messages}>
        <Providers locale={locale}>
          <AppLayout>
            {children}
          </AppLayout>
        </Providers>
      </NextIntlClientProvider>
    </AntdRegistry>
  );
}
