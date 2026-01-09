/**
 * GoatMouth Odds Calculation API
 *
 * Main server entry point
 * Dynamic odds calculation using CPMM formula with 2% house margin
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { PORT, FRONTEND_URL, NODE_ENV } = require('./src/config/constants');
const { testConnection } = require('./src/config/database');
const marketsRoutes = require('./src/routes/markets.routes');
const analyticsRoutes = require('./src/routes/analytics.routes');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler.middleware');
// const { requestTelemetry } = require('./src/middleware/telemetry.middleware');
// const { refreshConfig, cleanupOldLogs } = require('./src/services/telemetry.service');

// Create Express app
const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests from frontend URL or no origin (like Postman)
    const allowedOrigins = [
      FRONTEND_URL,
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'https://goatmouth.com',
      'https://www.goatmouth.com',
      'https://goatmouth.vercel.app'
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Logging middleware
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV
  });
});

// API routes
app.use('/api/markets', marketsRoutes);
app.use('/api/analytics', analyticsRoutes);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Load telemetry config and schedule refresh/cleanup (disabled - files not implemented yet)
    // await refreshConfig();
    // setInterval(() => refreshConfig(), 60 * 1000);
    // setInterval(() => cleanupOldLogs(), 6 * 60 * 60 * 1000);

    // Start listening
    app.listen(PORT, () => {
      console.log('');
      console.log('╔═══════════════════════════════════════════════════════════╗');
      console.log('║                                                           ║');
      console.log('║       GoatMouth Odds Calculation API                      ║');
      console.log('║       CPMM-based Dynamic Odds System                      ║');
      console.log('║                                                           ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log('');
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 Environment: ${NODE_ENV}`);
      console.log(`🎯 House Margin: 2%`);
      console.log(`💰 Default Pool Size: 1000`);
      console.log('');
      console.log('Available endpoints:');
      console.log(`  GET    http://localhost:${PORT}/health`);
      console.log(`  GET    http://localhost:${PORT}/api/markets/:id/odds`);
      console.log(`  POST   http://localhost:${PORT}/api/markets/:id/quote`);
      console.log(`  POST   http://localhost:${PORT}/api/markets/:id/bet (auth required)`);
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;
