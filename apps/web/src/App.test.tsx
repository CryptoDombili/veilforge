import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('VeilForge web app', () => {
  it('renders the vulnerable payroll demo and deterministic findings', () => {
    render(<App />);
    expect(screen.getByText(/Find what your Solidity contract will/i)).toBeInTheDocument();
    expect(screen.getByText('Privacy leaks')).toBeInTheDocument();
    expect(screen.getAllByText('VF008').length).toBeGreaterThan(0);
  });

  it('switches to the hardened demo', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Hardened' }));
    expect(screen.getByText('PayrollPrivateReady.sol')).toBeInTheDocument();
    expect(screen.getByText(/HARDENING DEMO/i)).toBeInTheDocument();
  });


  it('opens the v1.1 remediation intelligence workspace', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: /Remediation/i }));
    expect(screen.getByText('Privacy remediation lab')).toBeInTheDocument();
    expect(screen.getByText(/Why it matters/i)).toBeInTheDocument();
    expect(screen.getByText(/Safer Solidity pattern/i)).toBeInTheDocument();
  });

  it('opens the exposure map tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: /Exposure map/i }));
    expect(screen.getByText('Function exposure map')).toBeInTheDocument();
    expect(screen.getAllByText('Restricted').length).toBeGreaterThan(0);
  });
});
