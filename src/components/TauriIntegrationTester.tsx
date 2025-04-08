import React, { useState } from 'react';
import { runTauriIntegrationTests } from '@/lib/tauri-integration-browser';
import { runTypeInteropTests, TestResult } from '@/lib/test-interop';

export function TauriIntegrationTester() {
  const [testResults, setTestResults] = useState<{
    typeInterop: TestResult[] | null;
    integration: boolean | null;
    message: string;
  }>({
    typeInterop: null,
    integration: null,
    message: 'Run tests to see results'
  });

  const runAllTests = async () => {
    try {
      // Run type interoperability tests
      const typeInteropResults = await runTypeInteropTests();
      const typeInteropPassed = typeInteropResults.every(result => result.passed);
      
      // Run integration tests
      const integrationPassed = await runTauriIntegrationTests();
      
      // Update results
      setTestResults({
        typeInterop: typeInteropResults,
        integration: integrationPassed,
        message: typeInteropPassed && integrationPassed
          ? 'All tests passed successfully!'
          : 'Some tests failed. Check details below for more information.'
      });
    } catch (error) {
      setTestResults({
        typeInterop: null,
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
            ) : testResults.typeInterop.every(result => result.passed) ? (
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
        
        {/* Test result details */}
        {testResults.typeInterop && (
          <div className="mt-4">
            <h4 className="font-medium mb-2">Type Interop Test Details:</h4>
            <ul className="space-y-2">
              {testResults.typeInterop.map((result, index) => (
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
        
        <div className={`mt-4 p-3 rounded-md ${
          testResults.typeInterop === null
            ? 'bg-gray-100'
            : testResults.typeInterop.every(t => t.passed) && testResults.integration
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
