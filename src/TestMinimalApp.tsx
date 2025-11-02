console.log("TestMinimalApp.tsx loading...");

import React from 'react';

const TestMinimalApp = () => {
  console.log("TestMinimalApp component rendering");
  
  return (
    <div style={{ padding: '20px', color: 'green', fontFamily: 'monospace' }}>
      <h1>Minimal App Test</h1>
      <p>This is a minimal app component to test the basic structure.</p>
    </div>
  );
};

console.log("TestMinimalApp.tsx loaded successfully");

export default TestMinimalApp;