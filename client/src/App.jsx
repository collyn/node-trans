import { useState, lazy, Suspense } from "react";
import { I18nProvider } from "./i18n/I18nContext";
import { SocketProvider, useUI } from "./context/SocketContext";
import Header from "./components/Header";
import TabNav from "./components/TabNav";
import LiveTab from "./components/live/LiveTab";
import Sidebar from "./components/Sidebar";
import ToastContainer from "./components/Toast";
import StartupCheck from "./components/StartupCheck";

const SettingsModal = lazy(() => import("./components/settings/SettingsTab"));
const OverlayWindow = lazy(() => import("./components/live/OverlayWindow"));

function AppContent() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { overlayVisible } = useUI();

  return (
    <>
      <div className="flex h-screen max-w-7xl mx-auto px-5 py-4 bg-[#f0f2f8] dark:bg-[#06070b] text-gray-900 dark:text-gray-200 transition-colors duration-300">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Header />
          <TabNav onOpenSettings={() => setSettingsOpen(true)} />
          <div className="flex-1 overflow-hidden flex flex-col">
            <LiveTab />
          </div>
        </div>
      </div>
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal onClose={() => setSettingsOpen(false)} />
        </Suspense>
      )}
      {overlayVisible && !window.electronAPI?.isElectron && (
        <Suspense fallback={null}>
          <OverlayWindow />
        </Suspense>
      )}
      <ToastContainer />
      <StartupCheck />
    </>
  );
}

export default function App() {
  return (
    <I18nProvider>
    <SocketProvider>
      <AppContent />
    </SocketProvider>
    </I18nProvider>
  );
}
