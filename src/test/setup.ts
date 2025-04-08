import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock the Tauri API
vi.mock('@tauri-apps/api', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));
