import React, { useState } from 'react';
import { runTypeInteropTests } from '@/lib/test-interop';

export function TypeInteropTester() {
  const [testResults, setTestResults] = useState<{
    passed: boolean;
    message: string;
    details?: any[];
  } | null>(null);

  const runTests = async () => {
    try {
      const results = await runTypeInteropTests();
      const allPassed = results.every(result => result.passed);
      
      setTestResults({
        passed: allPassed,
        message: allPassed 
          ? 'All TypeScript-Rust type interoperability tests passed!' 
          : 'Some TypeScript-Rust type interoperability tests failed. Check the details below.',
        details: results
      });
    } catch (error) {
      setTestResults({
        passed: false,
        message: 'Error running tests',
        details: [{ testName: 'Test execution', passed: false, message: error instanceof Error ? error.message : String(error) }]
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
          
          {testResults.details && testResults.details.length > 0 && (
            <div className="mt-3">
              <h4 className="font-medium mb-2">Test Details:</h4>
              <ul className="space-y-2">
                {testResults.details.map((result, index) => (
                  <li key={index} className={`p-2 rounded ${result.passed ? 'bg-green-50' : 'bg-red-50'}`}>
                    <div className="flex justify-between">
                      <span className="font-medium">{result.testName}</span>
                      <span className={result.passed ? 'text-green-600' : 'text-red-600'}>
                        {result.passed ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                    {result.message && <p className="text-sm mt-1">{result.message}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
