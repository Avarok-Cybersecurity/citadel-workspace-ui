#!/bin/bash

# Check if the internal service is running
if [ ! -f "./.service-pid" ] || [ ! -f "./.server-pid" ]; then
  echo "Starting internal services..."
  cd ..
  just start-servers
  sleep 2
else
  echo "Internal services are already running."
fi

# Run the tests
echo "Running Tauri interoperability tests..."
cd citadel-workspaces
npm test
