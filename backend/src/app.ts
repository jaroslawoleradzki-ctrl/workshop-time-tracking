import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import employeesRouter from './routes/employees';
import ordersRouter from './routes/orders';
import workTimeTypesRouter from './routes/work-time-types';
import reportsRouter from './routes/reports';
import analyticsRouter from './routes/analytics';
import importsRouter from './routes/imports';
import prisma from './utils/prisma';
import packageJson from '../package.json';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logger for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/work-time-types', workTimeTypesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/imports', importsRouter);

// Base route for health check
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      database: 'ok',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check database error:', error);
    res.status(503).json({
      status: 'error',
      database: 'error',
      timestamp: new Date().toISOString()
    });
  }
});

// Version endpoint
app.get('/api/version', (req, res) => {
  res.json({
    name: 'workshop-time-tracking',
    version: process.env.APP_VERSION || packageJson.version,
    backendVersion: packageJson.version,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Wystąpił wewnętrzny błąd serwera',
  });
});

export default app;
