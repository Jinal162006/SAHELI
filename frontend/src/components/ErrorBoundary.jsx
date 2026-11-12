import { Component } from 'react';
import { useT } from '../lib/i18n';
import { Button, Notice } from './ui';

function Fallback({ onRetry }) {
  const t = useT();
  return (
    <div className="mx-auto max-w-xl py-10">
      <Notice
        tone="danger"
        title={t('errors.title')}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t('common.try_again')}
            </Button>
            <a href="tel:112" className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-danger-700 hover:underline">
              {t('sos.call_112')}
            </a>
          </div>
        }
      >
        {t('errors.generic')}
      </Notice>
    </div>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Page error', error);
  }

  render() {
    if (this.state.failed) {
      return <Fallback onRetry={() => this.setState({ failed: false })} />;
    }
    return this.props.children;
  }
}
