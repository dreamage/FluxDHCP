import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export default async function HomePage() {
  const headersList = await headers();
  const acceptLang = headersList.get('accept-language') || '';
  const preferred = acceptLang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  redirect(`/${preferred}/dashboard`);
}
