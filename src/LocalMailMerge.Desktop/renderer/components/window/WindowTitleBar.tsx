import { useEffect, useState } from 'react';
import { MailPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function WindowTitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const desktopApi = window.desktopApi;
    if (!desktopApi) return;

    void desktopApi.isMaximized().then(setMaximized).catch(() => undefined);
    desktopApi.onMaximizedChange(setMaximized);
    return () => desktopApi.offMaximizedChange();
  }, []);

  const minimize = () => { void window.desktopApi?.minimize(); };
  const toggleMaximize = () => {
    void window.desktopApi?.toggleMaximize().then(setMaximized);
  };
  const close = () => { void window.desktopApi?.close(); };

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="titlebar-logo"><MailPlus /></span>
        <span>Local Mail Merge</span>
      </div>
      <div className="window-controls" role="group" aria-label="窗口控制">
        <Button variant="ghost" size="icon" className="window-control" aria-label="最小化窗口" title="最小化" onClick={minimize}>
          <span className="window-control-glyph" aria-hidden="true">{'\uE921'}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="window-control"
          aria-label={maximized ? '还原窗口' : '最大化窗口'}
          title={maximized ? '还原' : '最大化'}
          onClick={toggleMaximize}
        >
          <span className="window-control-glyph" aria-hidden="true">{maximized ? '\uE923' : '\uE922'}</span>
        </Button>
        <Button variant="ghost" size="icon" className="window-control window-control--close" aria-label="关闭窗口" title="关闭" onClick={close}>
          <span className="window-control-glyph" aria-hidden="true">{'\uE8BB'}</span>
        </Button>
      </div>
    </header>
  );
}
