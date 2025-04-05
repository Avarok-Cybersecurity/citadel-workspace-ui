import React, { useState } from 'react';
import { runTauriIntegrationTests } from '@/lib/tauri-integration-browser';
import { runTypeInteropTests } from '@/lib/test-interop';

export function TauriIntegrationTester() {
  const [testResults, setTestResults] = useState<{
    typeInterop: boolean | null;
    integration: boolean | null;
    message: string;
  }>({
    typeInterop: null,
    integration: null,
    message: 'Run tests to see results'
  });

  const runAllTests = () => {
    try {
      // Run type interoperability tests
      const typeInteropPassed = runTypeInteropTests();
      
      // Run integration tests
      const integrationPassed = runTauriIntegrationTests();
      
      // Update results
      setTestResults({
        typeInterop: typeInteropPassed,
        integration: integrationPassed,
        message: typeInteropPassed && integrationPassed
          ? 'All tests passed successfully!'
          : 'Some tests failed. Check the console for details.'
      });
    } catch (error) {
      setTestResults({
        typeInterop: false,
        integration: false,
        message: `Error running tests: ${error instanceof Error ? error.message : String(error)}`
      });
      console.error('Test error:', error);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4">Tauri-TypeScript Integration Tests</h2>
      
      <button
        onClick={runAllTests}
        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
      >
        Run All Tests
      </button>
      
      <div className="mt-4">
        <h3 className="font-semibold mb-2">Test Results:</h3>
        
        <div className="space-y-2">
          <div className="flex items-center">
            <span className="w-48">Type Interoperability:</span>
            {testResults.typeInterop === null ? (
              <span className="text-gray-500">Not run</span>
            ) : testResults.typeInterop ? (
              <span className="text-green-500">PASSED</span>
            ) : (
              <span className="text-red-500">FAILED</span>
            )}
          </div>
          
          <div className="flex items-center">
            <span className="w-48">Integration Tests:</span>
            {testResults.integration === null ? (
              <span className="text-gray-500">Not run</span>
            ) : testResults.integration ? (
              <span className="text-green-500">PASSED</span>
            ) : (
              <span className="text-red-500">FAILED</span>
            )}
          </div>
        </div>
        
        <div className={`mt-4 p-3 rounded-md ${
          testResults.typeInterop === null
            ? 'bg-gray-100'
            : testResults.typeInterop && testResults.integration
              ? 'bg-green-100'
              : 'bg-red-100'
        }`}>
          <p>{testResults.message}</p>
        </div>
      </div>
      
      <div className="mt-6">
        <h3 className="font-semibold mb-2">Test Information</h3>
        <p className="text-sm">
          These tests verify the integration between TypeScript and Rust through Tauri:
        </p>
        <ul className="list-disc pl-5 mt-2 text-sm">
          <li>Type interoperability between TypeScript and Rust</li>
          <li>JSON structure matching between frontend and backend</li>
          <li>Round-trip conversion of data types</li>
        </ul>
        <p className="text-sm mt-2">
          Detailed test results are logged to the browser console.
        </p>
      </div>
    </div>
  );
}
