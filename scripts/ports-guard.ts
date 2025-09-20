#!/usr/bin/env npx tsx

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface PortInfo {
  port: number;
  name: string;
  required: boolean;
}

const PORTS: PortInfo[] = [
  { port: 8787, name: 'Amazon Proxy', required: true },
  { port: 8402, name: 'Payment Proxy', required: true },
  { port: 3001, name: 'Mallory App', required: false },
  { port: 3000, name: 'Next.js Dev', required: false },
];

async function checkPort(port: number): Promise<{ inUse: boolean; pid?: string; command?: string }> {
  try {
    const { stdout } = await execAsync(`lsof -ti :${port}`);
    const pid = stdout.trim();

    if (pid) {
      try {
        const { stdout: psOutput } = await execAsync(`ps -p ${pid} -o comm=`);
        const command = psOutput.trim();
        return { inUse: true, pid, command };
      } catch {
        return { inUse: true, pid };
      }
    }
    return { inUse: false };
  } catch {
    return { inUse: false };
  }
}

async function main() {
  console.log('🔍 Checking port availability...\n');

  const results = await Promise.all(
    PORTS.map(async (portInfo) => {
      const result = await checkPort(portInfo.port);
      return { ...portInfo, ...result };
    })
  );

  // Print table
  console.log('Port\tService\t\tStatus\t\tPID\tCommand');
  console.log('----\t-------\t\t------\t\t---\t-------');

  results.forEach((result) => {
    const status = result.inUse ? '❌ IN USE' : '✅ FREE';
    const pid = result.pid || '-';
    const command = result.command || '-';
    console.log(`${result.port}\t${result.name}\t\t${status}\t\t${pid}\t${command}`);
  });

  // Check for conflicts
  const conflicts = results.filter((r) => r.inUse && r.required);

  if (conflicts.length > 0) {
    console.log('\n🚨 Port conflicts detected!');
    console.log('\nRequired ports in use:');
    conflicts.forEach((conflict) => {
      console.log(`  Port ${conflict.port} (${conflict.name}) - PID ${conflict.pid}`);
    });

    console.log('\n💡 To fix this:');
    console.log('1. Kill existing processes:');
    conflicts.forEach((conflict) => {
      console.log(`   kill ${conflict.pid}`);
    });
    console.log('2. Or use different ports in your .env files');
    console.log('3. Then re-run this script');

    process.exit(1);
  } else {
    console.log('\n✅ All required ports are available!');
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Error checking ports:', error);
    process.exit(1);
  });
}

export { checkPort, PORTS };