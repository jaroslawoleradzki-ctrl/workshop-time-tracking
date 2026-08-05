import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import waitOn from 'wait-on';
import { verifyDocumentationEnvironment, ROOT_DIR } from './config';

const PID_FILE = path.join(ROOT_DIR, '.docs-runner-pids.json');

export async function prepareEnvironment() {
  console.log('🚀 [docs:prepare] Przygotowanie izolowanego środowiska dokumentacyjnego...');

  // Set environment variables for docs mode
  process.env.DOCS_MODE = 'true';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://time_user:secure_db_password@localhost:5432/time_reporting_docs?schema=public';
  process.env.PORT = '5001';
  process.env.JWT_SECRET = 'docs_jwt_secret_key_testing_12345';
  process.env.NODE_ENV = 'test';

  verifyDocumentationEnvironment();

  // 1. Try launching docker-compose.docs.yml if docker is available
  try {
    console.log('🐳 Sprawdzanie kontenera bazy PostgreSQL (docker compose)...');
    execSync('docker compose -f docker-compose.docs.yml up -d', { cwd: ROOT_DIR, stdio: 'inherit' });
  } catch (err) {
    console.warn('⚠️ Uwaga: Kontener Docker nie został uruchomiony automatycznie. Używanie lokalnej bazy PostgreSQL na porcie 5432.');
  }

  // 2. Run Prisma migrations on docs DB
  console.log('📦 Uruchamianie migracji Prisma na bazie _docs...');
  const backendDir = path.join(ROOT_DIR, 'backend');
  try {
    execSync('npx prisma db push --skip-generate', {
      cwd: backendDir,
      env: { ...process.env },
      stdio: 'inherit',
    });
  } catch (e) {
    console.log('Instalowanie wygenerowanego klienta prisma...');
    execSync('npx prisma generate', { cwd: backendDir, env: { ...process.env }, stdio: 'inherit' });
    execSync('npx prisma db push --skip-generate', { cwd: backendDir, env: { ...process.env }, stdio: 'inherit' });
  }

  // 3. Run seed-doc
  console.log('🌱 Zasiewanie danych w bazie demonstracyjnej (seed:doc)...');
  execSync('npm run seed:doc', {
    cwd: backendDir,
    env: { ...process.env },
    stdio: 'inherit',
  });

  // 4. Spawn backend and frontend processes in background if not already responding
  const runningPids: number[] = [];

  console.log('🌐 Uruchamianie serwera backendu (port 5001)...');
  const backendProcess = spawn('npx', ['ts-node', 'src/index.ts'], {
    cwd: backendDir,
    env: { ...process.env, PORT: '5001' },
    stdio: 'pipe',
    shell: true,
  });
  if (backendProcess.pid) runningPids.push(backendProcess.pid);

  console.log('🎨 Uruchamianie serwera frontendu (port 5173)...');
  const frontendDir = path.join(ROOT_DIR, 'frontend');
  const frontendProcess = spawn('npx', ['vite', '--port', '5173'], {
    cwd: frontendDir,
    env: { ...process.env },
    stdio: 'pipe',
    shell: true,
  });
  if (frontendProcess.pid) runningPids.push(frontendProcess.pid);

  fs.writeFileSync(PID_FILE, JSON.stringify(runningPids, null, 2));

  // 5. Wait for ports 5001 and 5173
  console.log('⏳ Oczekiwanie na gotowość HTTP (http://localhost:5001 oraz http://localhost:5173)...');
  await waitOn({
    resources: ['http-get://localhost:5001/api/version', 'http-get://localhost:5173'],
    timeout: 30000,
    interval: 500,
  });

  console.log('✅ Środowisko gotowe do wykonywania zrzutów ekranu!');
}

if (require.main === module) {
  prepareEnvironment().catch((err) => {
    console.error('❌ Błąd podczas przygotowania środowiska:', err);
    process.exit(1);
  });
}
