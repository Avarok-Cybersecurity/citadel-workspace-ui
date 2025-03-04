import React, { useState } from 'react';
import { runTypeInteropTests } from '@/lib/test-interop';

export function TypeInteropTester() {
  const [testResults, setTestResults] = useState<{
    passed: boolean;
    message: string;
    details?: string;
  } | null>(null);

  const runTests = () => {
    try {
      const passed = runTypeInteropTests();
      
      setTestResults({
        passed,
        message: passed 
          ? 'All TypeScript-Rust type interoperability tests passed!' 
          : 'Some TypeScript-Rust type interoperability tests failed. Check the console for details.'
      });
    } catch (error) {
      setTestResults({
        passed: false,
        message: 'Error running tests',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4">TypeScript-Rust Type Interoperability Tests</h2>
      
      <button
        onClick={runTests}
        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
      >
        Run Type Interop Tests
      </button>
      
      {testResults && (
        <div className={`mt-4 p-3 rounded-md ${testResults.passed ? 'bg-green-100' : 'bg-red-100'}`}>
          <p className="font-semibold">{testResults.message}</p>
          {testResults.details && <p className="mt-2 text-sm">{testResults.details}</p>}
        </div>
      )}
      
      <div className="mt-6">
        <h3 className="font-semibold mb-2">Test Information</h3>
        <p className="text-sm">
          These tests verify that the TypeScript types correctly map to the Rust types used in the Tauri backend.
          The tests check:
        </p>
        <ul className="list-disc pl-5 mt-2 text-sm">
          <li>WorkspaceConfig → RegistrationRequestTS conversion</li>
          <li>WorkspaceConfig → ConnectRequestTS conversion</li>
          <li>Field name mapping between TypeScript and Rust</li>
          <li>Type conversions (e.g., string → number)</li>
        </ul>
        <p className="text-sm mt-2">
          Detailed test results are logged to the browser console.
        </p>
      </div>
    </div>
  );
}
