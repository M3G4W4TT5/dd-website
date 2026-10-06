import {useFormsAvailable, formEndpoint, PreviewFormsNotice} from '../lib/forms';
import {useEffect, useState} from 'react';
import type {CopyGroup, SupportingPage} from '../cms/model';

export function MarketingAction({purpose, page, copy, formsCopy}: {
  purpose: 'confirm' | 'unsubscribe'; page: SupportingPage; copy: CopyGroup<'marketing'>; formsCopy: CopyGroup<'forms'>;
}) {
  const available = useFormsAvailable();
  const [token, setToken] = useState('');
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (value) setToken(value);
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  const [state, setState] = useState<'ready' | 'working' | 'done' | 'expired' | 'error'>('ready');
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);
  async function submit() {
    if (!available) return;
    setState('working');
    try {
      const response = await fetch(formEndpoint('/api/marketing/action'), {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({list: 'personal', purpose, token}),
      });
      setState(response.ok ? 'done' : response.status === 410 ? 'expired' : 'error');
    } catch {setState('error');}
  }
  return <main className="newsletter-unsubscribe-page marketing-page">
    <a href="/" className="wordmark">DD<span>.</span></a>
    <h1>{page.heading}</h1>
    <PreviewFormsNotice available={available} copy={formsCopy} />
    <p>{page.description}</p>
    {(state === 'ready' || state === 'error') && validToken && <button className="marketing-action-button" type="button" disabled={!available} onClick={() => void submit()}>{page.action}</button>}
    {state === 'ready' && !validToken && <p role="status">{page.missing}</p>}
    {state === 'working' && <p role="status">{copy.working}</p>}
    {state === 'done' && <p role="status">{page.success}</p>}
    {state === 'expired' && <p role="status">{copy.expired}</p>}
    {state === 'error' && <p role="alert">{copy.error}</p>}
    {(state === 'expired' || (state === 'ready' && !validToken)) && <p><a href={purpose === 'unsubscribe' ? '/unsubscribe' : '/#newsletter'}>{page.recovery}</a></p>}
    <a href="https://didde-mie.com">{copy.back}</a>
  </main>;
}
