import { getRequestConfig } from 'next-intl/server';
import { routing } from '../src/i18n/routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as 'en' | 'zh')) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./${locale}.json`)).default,
  };
});
