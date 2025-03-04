import '@testing-library/jest-dom';

// Mock the Tauri API
vi.mock('@tauri-apps/api', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

// Set environment variables needed for tests
process.env.INTERNAL_SERVICE_PATH = '../citadel-internal-service';
