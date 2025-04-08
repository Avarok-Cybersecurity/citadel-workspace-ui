import React from 'react';
import { TauriDemo } from '@/components/TauriDemo';
import { TypeInteropTester } from '@/components/TypeInteropTester';
import { TauriIntegrationTester } from '@/components/TauriIntegrationTester';
import { RustToTSListener } from '@/components/RustToTSListener';

export function TestPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Tauri-TypeScript Integration Test Suite</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">1. Type Interoperability Tests</h2>
          <TypeInteropTester />
        </div>
        
        <div>
          <h2 className="text-xl font-semibold mb-4">2. Integration Tests</h2>
          <TauriIntegrationTester />
        </div>
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">3. Rust-to-TypeScript Communication</h2>
        <RustToTSListener />
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">4. Tauri API Demo</h2>
        <TauriDemo />
      </div>
      
      <div className="mt-8 p-4 bg-gray-100 rounded-md">
        <h2 className="text-xl font-semibold mb-2">Test Instructions</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <strong>Run Type Interoperability Tests</strong> - These tests verify that the TypeScript types correctly map to the Rust types.
          </li>
          <li>
            <strong>Run Integration Tests</strong> - These tests verify that the JSON structure matches between frontend and backend, and that round-trip conversions work.
          </li>
          <li>
            <strong>Test Rust-to-TypeScript Communication</strong> - This simulates events from Rust and verifies that the TypeScript code responds correctly.
          </li>
          <li>
            <strong>Try the Tauri API Demo</strong> - This demonstrates the actual usage of the Tauri commands from the frontend.
          </li>
        </ol>
        <p className="mt-4">
          All test results are logged to the browser console for detailed inspection.
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Note: For the Tauri API Demo to work properly, the internal service and server must be running. 
          Run "just start-servers" before testing.
        </p>
      </div>
    </div>
  );
}
