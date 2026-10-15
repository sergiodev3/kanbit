import { Outlet } from 'react-router';
import { InstallButton } from '../shared/pwa/InstallButton';
import { IosInstallGuide } from '../shared/pwa/IosInstallGuide';
import { OfflineBanner } from '../shared/pwa/OfflineBanner';
import { UpdatePrompt } from '../shared/pwa/UpdatePrompt';

export function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <OfflineBanner />
      <header className="flex items-center justify-between gap-3 bg-brand-600 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <span className="text-lg font-bold tracking-tight">Kanbit</span>
        <InstallButton />
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 p-4">
        <IosInstallGuide />
        <Outlet />
      </main>
      <UpdatePrompt />
    </div>
  );
}
