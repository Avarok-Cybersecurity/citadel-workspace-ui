#!/bin/bash

# Set the required environment variable
export INTERNAL_SERVICE_PATH="../citadel-internal-service"

# Check if the internal service is running
if [ ! -f "${INTERNAL_SERVICE_PATH}/.service-pid" ] || [ ! -f "${INTERNAL_SERVICE_PATH}/.server-pid" ]; then
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
