/**
 * The Profile step needs the Terms ticked to Join, and offers diagnostics as a separate choice
 * that is off unless ticked.
 *
 * `useJoinRegistration` is replaced (it needs a backend); the form, the agreements and the
 * terms dialog are the real components.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { JoinRegistration } from '../join-registration-shape';
import { Join } from '../Join';
import { BLANK_JOIN_FORM } from '../join-form-blank';
import { SHOWN_PLATFORM_TERMS_TEXT } from '@/lib/terms/platform-terms';

let registration: JoinRegistration;
vi.mock('../useJoinRegistration', () => ({
  useJoinRegistration: (): JoinRegistration => registration,
}));

function renderJoin(formData: Partial<JoinRegistration['formData']> = {}, termsMissing: boolean = false): { submit: ReturnType<typeof vi.fn>; optional: ReturnType<typeof vi.fn> } {
  const submit: ReturnType<typeof vi.fn> = vi.fn();
  const optional: ReturnType<typeof vi.fn> = vi.fn();
  registration = {
    formData: { ...BLANK_JOIN_FORM, ...formData },
    isRegistering: false, showNotInitializedModal: false, showConnectModal: false, connectStatus: 'connecting',
    handleInputChange: vi.fn(), handleOptionalChange: optional as unknown as JoinRegistration['handleOptionalChange'],
    termsMissing, handleBlur: vi.fn(), fieldErrors: { fullName: null, username: null, password: null, confirmPassword: null },
    handleSubmit: submit, handleConnectModalComplete: vi.fn(), handleReturnToLogin: vi.fn(),
    recoveryCodes: [], awaitingSignIn: null, finishSignIn: vi.fn(),
  };
  render(<MemoryRouter><Join onNext={vi.fn()} onBack={vi.fn()} serverAddress="citadel.example.com:12400" serverPassword="" /></MemoryRouter>);
  return { submit, optional };
}

describe('the Terms checkbox', () => {
  it('starts unticked and required', () => {
    renderJoin();
    expect(screen.getByTestId('join-terms')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('join-terms')).toHaveAttribute('aria-required', 'true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says why at the checkbox once Join was pressed without it', () => {
    renderJoin({}, true);
    expect(screen.getByRole('alert')).toHaveTextContent('Accept the Terms to join.');
    expect(screen.getByTestId('join-terms')).toHaveAttribute('aria-invalid', 'true');
  });

  it('reports the tick to the registration state', () => {
    const { optional } = renderJoin();
    fireEvent.click(screen.getByTestId('join-terms'));
    expect(optional).toHaveBeenCalledWith('termsAccepted', true);
  });

  it('opens the platform terms to read', () => {
    renderJoin();
    fireEvent.click(screen.getByRole('button', { name: 'Terms' }));
    expect(screen.getByTestId('terms-dialog')).toHaveTextContent(SHOWN_PLATFORM_TERMS_TEXT.split('\n')[0].replace('# ', ''));
  });
});

describe('the diagnostics checkbox', () => {
  it('is off by default, is separate from the Terms, and says what is sent', () => {
    renderJoin();
    expect(screen.getByTestId('join-diagnostics')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Warnings and errors only, with names, files and addresses removed/)).toBeTruthy();
  });

  it('is reported when ticked, without touching the Terms', () => {
    const { optional } = renderJoin();
    fireEvent.click(screen.getByTestId('join-diagnostics'));
    expect(optional).toHaveBeenCalledTimes(1);
    expect(optional).toHaveBeenCalledWith('shareDiagnostics', true);
  });
});
