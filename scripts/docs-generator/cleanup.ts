import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { ROOT_DIR } from './config';

const PID_FILE = path.join(ROOT_DIR, '.docs-runner-pids.json');

function findDockerBinary(): string | null {
  const candidates = [
    'docker',
    '/usr/local/bin/docker',
    '/opt/homebrew/bin/docker',
    '/usr/bin/docker',
    '/Applications/Docker.app/Contents/Resources/bin/docker',
  ];

  for (const bin of candidates) {
    try {
      execSync(`${bin} version --format "{{.Client.Version}}"`, { stdio: 'pipe' });
      return bin;
    } catch {
      // try next
    }
  }
  return null;
}

export async function cleanupEnvironment() {
  console.log('🧹 [docs:cleanup] Zatrzymywanie procesów i kontenerów środowiska dokumentacyjnego...');

  let cleanupErrors: string[] = [];

  // 1. Kill spawned background Node processes from PID file
  if (fs.existsSync(PID_FILE)) {
    try {
      const pids: number[] = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGTERM');
          console.log(`  -> Zakończono proces PID: ${pid}`);
        } catch (e: any) {
          // ESRCH = process not found (already gone), not an error
          if (e.code !== 'ESRCH') {
            console.warn(`  ⚠️ Nie udało się zakończyć PID ${pid}: ${e.message}`);
          }
        }
      }
    } catch (e: any) {
      cleanupErrors.push(`Błąd odczytu pliku PID: ${e.message}`);
    } finally {
      // Always remove PID file after attempting cleanup
      try {
        fs.unlinkSync(PID_FILE);
        console.log(`  -> Usunięto plik .docs-runner-pids.json`);
      } catch {
        // already gone
      }
    }
  } else {
    console.log('  ℹ️ Brak pliku .docs-runner-pids.json, pomijanie.');
  }

  // 2. Kill any orphan processes on known docs ports (macOS/Linux)
  const portKillPairs = [
    { port: 5001, desc: 'backend dokumentacyjny' },
    { port: 5173, desc: 'frontend dokumentacyjny (Vite)' },
  ];

  for (const { port, desc } of portKillPairs) {
    try {
      const result = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: 'utf8' }).trim();
      if (result) {
        const pids = result.split('\n').filter(Boolean);
        for (const pid of pids) {
          try {
            execSync(`kill -TERM ${pid}`, { stdio: 'ignore' });
            console.log(`  -> Zakończono proces ${desc} (PID: ${pid}, port: ${port})`);
          } catch {
            // already dead
          }
        }
      }
    } catch {
      // no process on that port – that's fine
    }
  }

  // 3. Shut down docker containers (locate binary first)
  const dockerBin = findDockerBinary();

  if (dockerBin) {
    console.log(`🐳 Wyłączanie kontenera Docker docs-db (${dockerBin})...`);
    try {
      const output = execSync(
        `${dockerBin} compose -f docker-compose.docs.yml down -v 2>&1`,
        { cwd: ROOT_DIR, encoding: 'utf8' }
      );
      console.log(output.trim());
    } catch (err: any) {
      const msg = err.stdout?.trim() || err.message || String(err);
      console.warn(`  ⚠️ Docker compose down zgłosił błąd: ${msg}`);
      cleanupErrors.push(`docker compose down: ${msg}`);
    }
  } else {
    console.log('  ℹ️ Docker nie wykryty w żadnej ze znanych lokalizacji — pomijanie docker compose down.');
  }

  if (cleanupErrors.length > 0) {
    console.warn(`\n⚠️  Cleanup zakończony z ${cleanupErrors.length} ostrzeżeniem(i):`);
    cleanupErrors.forEach((e) => console.warn(`   - ${e}`));
  } else {
    console.log('✅ Czyszczenie środowiska zakończone pomyślnie!');
  }
}

if (require.main === module) {
  cleanupEnvironment().catch((err) => {
    console.error('❌ Błąd podczas czyszczenia środowiska:', err);
    process.exit(1);
  });
}
