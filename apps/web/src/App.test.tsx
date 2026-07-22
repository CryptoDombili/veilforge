import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('VeilForge v1.8 web app', () => {
  it('renders Privacy Mission Control and project triage', () => {
    render(<App />);
    expect(screen.getByText(/Trace how privacy escapes/i)).toBeInTheDocument();
    expect(screen.getByText('Project risk map')).toBeInTheDocument();
    expect(screen.getAllByText(/Deployment blocked/i).length).toBeGreaterThan(0);
  });

  it('switches to the hardened demo', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Hardened' }));
    expect(screen.getAllByText(/PayrollPrivateReady/i).length).toBeGreaterThan(0);
  });

  it('opens deterministic exposure chains', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: /Exposure chains/i }));
    expect(screen.getByText('Exposure chains')).toBeInTheDocument();
    expect(screen.getByText(/Observed source relationships only/i)).toBeInTheDocument();
  });

  it('opens Treatment Plan 2.0', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: /Treatment plan/i }));
    expect(screen.getByText('Treatment Plan 2.0')).toBeInTheDocument();
    expect(screen.getByText(/Expected outcome/i)).toBeInTheDocument();
  });

  it('opens Policy Studio', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: /Policy studio/i }));
    expect(screen.getByText('Selector exposure boundaries')).toBeInTheDocument();
    expect(screen.getAllByText('Restricted').length).toBeGreaterThan(0);
  });
});
